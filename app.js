(() => {
  // v5 — Ajustements :
  // 1) Légende : suppression du mot "rouges" + ajout CO2 ✅
  // 2) C(s) : tas compact centré au bas de la scène ✅
  // 3) Valeurs par défaut : 10 C(s) et 15 O2 ✅
  // 4) Remplace "vitesse" par "température" : T ↑ => vitesse des gaz ↑ (effet visible) ✅

  const canvas = document.getElementById("sim");
  const ctx = canvas.getContext("2d");

  const ui = {
    c0: document.getElementById("c0"),
    o20: document.getElementById("o20"),
    n20: document.getElementById("n20"),
    temp: document.getElementById("temp"),
    start: document.getElementById("start"),
    pause: document.getElementById("pause"),
    reset: document.getElementById("reset"),
    toggleLabels: document.getElementById("toggleLabels"),
    status: document.getElementById("status"),
  };

  const W = canvas.width, H = canvas.height;
  const topHUD = 62;
  const pad = 18;

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function rnd(a,b){ return a + Math.random()*(b-a); }
  function dist2(ax,ay,bx,by){ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; }

  // Couleurs
  const COL_C = "#222222";
  const COL_O = "#d22a2a";
  const COL_N = "#1e5ac8";
  const COL_BOND = "rgba(0,0,0,0.20)";

  // Tailles (modèles compacts)
  const R_ATOM = 10;
  const D_DIATOMIC = 7;

  // Etat
  let running = false;
  let paused = false;
  let showLabels = false;

  let gas = [];     // O2, N2, CO2
  let solidC = [];  // sites fixes

  let nC = 0, nO2 = 0, nN2 = 0, nCO2 = 0;

  // Pour la "fréquence" de réaction : liée à la température (uniquement pour rendre l'effet plausible)
  let reactionAccumulator = 0;

  function setStatus(html){ ui.status.innerHTML = html; }

  function tempToSpeedScale(tempC){
    // échelle simple : à 0°C -> ~0.8 ; à 200°C -> ~2.2
    return 0.8 + clamp(tempC, 0, 300) / 140;
  }

  function tempToReactionScale(tempC){
    // plus chaud -> plus de tentatives de réaction par seconde (sans être délirant)
    return 0.8 + clamp(tempC, 0, 300) / 120;
  }

  function makeGas(kind){
    return {
      kind,
      x: rnd(pad, W-pad),
      y: rnd(topHUD + pad, H - pad - 170),
      vx: rnd(-0.9, 0.9),
      vy: rnd(-0.7, 0.7),
      a: rnd(0, Math.PI*2),
      va: rnd(-0.03, 0.03),
      alive: true
    };
  }

  function spawnGas(kind, n){
    for (let i=0;i<n;i++) gas.push(makeGas(kind));
  }

  // Tas compact : empilement hexagonal mais sur une largeur limitée, centré
  function buildSolidPile(nSites){
    solidC = [];
    const r = 10;
    const dx = 2.02 * r;
    const dy = 1.74 * r;
    const floorY = H - pad - r;

    // largeur du tas : on la déduit de nSites (petit tas => étroit et haut)
    const cols = Math.max(2, Math.min(9, Math.ceil(Math.sqrt(nSites) + 1)));
    const maxRows = 14;

    const pileWidth = (cols - 1) * dx + 2*r;
    const x0 = (W - pileWidth) / 2 + r;

    let placed = 0;
    for (let row = 0; row < maxRows && placed < nSites; row++){
      const y = floorY - row * dy;
      const offset = (row % 2 === 0) ? 0 : dx / 2;

      // nombre de colonnes par rangée : on fait une "pyramide" (plus large en bas, plus étroite en haut)
      const rowCols = Math.max(1, Math.min(cols, cols - Math.floor(row / 2)));
      const rowWidth = (rowCols - 1) * dx + 2*r;
      const rowX0 = (W - rowWidth) / 2 + r;

      for (let col = 0; col < rowCols && placed < nSites; col++){
        const x = rowX0 + offset + col * dx;
        // jitter minime pour éviter l'effet "ligne parfaite"
        const jx = rnd(-0.25, 0.25);
        const jy = rnd(-0.25, 0.25);
        solidC.push({ x: x + jx, y: y + jy, r, alive: true });
        placed++;
      }
    }

    // fallback (si nSites > capacité)
    while (placed < nSites){
      const x = rnd(W/2 - 70, W/2 + 70);
      const y = rnd(floorY - 9*dy, floorY);
      let ok = true;
      for (const s of solidC){
        if (dist2(x,y,s.x,s.y) < (1.6*r)*(1.6*r)){ ok = false; break; }
      }
      if (ok){
        solidC.push({ x, y, r, alive:true });
        placed++;
      }
    }
  }

  function recount(){
    nC = solidC.filter(s=>s.alive).length;
    nO2 = gas.filter(p=>p.alive && p.kind==="O2").length;
    nN2 = gas.filter(p=>p.alive && p.kind==="N2").length;
    nCO2 = gas.filter(p=>p.alive && p.kind==="CO2").length;
  }

  function resetFromUI(){
    running = false;
    paused = false;
    reactionAccumulator = 0;

    gas = [];
    const c0 = clamp(parseInt(ui.c0.value||"0",10), 1, 120);
    const o20 = clamp(parseInt(ui.o20.value||"0",10), 0, 200);
    const n20 = clamp(parseInt(ui.n20.value||"0",10), 0, 200);

    buildSolidPile(c0);
    spawnGas("O2", o20);
    spawnGas("N2", n20);
    recount();

    ui.pause.disabled = true;
    ui.start.disabled = false;
    ui.pause.textContent = "Pause";

    showLabels = false;
    ui.toggleLabels.textContent = "Afficher les symboles";

    let diag = "";
    if (o20 === 0) diag = "O₂ absent : aucune réaction possible.";
    else if (o20 < c0) diag = "Attendu : O₂ limitant ; carbone en excès (solide restant).";
    else if (c0 < o20) diag = "Attendu : carbone limitant ; O₂ en excès.";
    else diag = "Attendu : proportions stœchiométriques (aucun excès).";

    setStatus(`Modèles compacts <b>sans symboles</b> par défaut.<br>${diag}`);
  }

  function bounce(p){
    const minX = pad, maxX = W-pad;
    const minY = topHUD+pad, maxY = H-pad;
    if (p.x < minX){ p.x = minX; p.vx *= -1; }
    if (p.x > maxX){ p.x = maxX; p.vx *= -1; }
    if (p.y < minY){ p.y = minY; p.vy *= -1; }
    if (p.y > maxY){ p.y = maxY; p.vy *= -1; }
  }

  function stepGas(dt){
    const tempC = clamp(parseFloat(ui.temp.value||"20"), 0, 300);
    const s = tempToSpeedScale(tempC);

    for (const p of gas){
      if (!p.alive) continue;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.a += p.va * s * 0.9;
      bounce(p);

      // convection légère sur CO2
      if (p.kind === "CO2") p.vy -= 0.010 * s;
    }
  }

  function findNearestAliveSolid(x,y){
    let best = null, bestd = Infinity;
    for (const s of solidC){
      if (!s.alive) continue;
      const d = dist2(x,y,s.x,s.y);
      if (d < bestd){ bestd = d; best = s; }
    }
    return { best, bestd };
  }

  function tryReactOne(){
    const o2s = gas.filter(p=>p.alive && p.kind==="O2");
    if (o2s.length === 0) return false;

    const o2 = o2s[Math.floor(Math.random()*o2s.length)];
    const surfaceBandTop = H - 210;
    if (o2.y < surfaceBandTop) return false;

    const { best, bestd } = findNearestAliveSolid(o2.x, o2.y);
    const threshold = 28*28;
    if (!best || bestd > threshold) return false;

    best.alive = false;
    o2.alive = false;

    const co2 = makeGas("CO2");
    co2.x = best.x;
    co2.y = best.y - 20;
    co2.vx = rnd(-0.6, 0.6);
    co2.vy = rnd(-1.3, -0.5);
    gas.push(co2);
    return true;
  }

  // ---- dessin
  function sphere(x,y,r,color){
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fill();
  }

  function label(txt,x,y,size){
    if (!showLabels) return;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `${size}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(txt,x,y);
  }

  function bond(x1,y1,x2,y2){
    ctx.strokeStyle = COL_BOND;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.lineTo(x2,y2);
    ctx.stroke();
  }

  function drawSolid(){
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(0, H-pad-12, W, 24);

    for (const s of solidC){
      if (!s.alive) continue;
      sphere(s.x, s.y, 10, "rgba(30,30,30,0.86)");
      label("C", s.x, s.y, 12);
    }
  }

  function drawDiatomic(p, color, letter){
    const dx = Math.cos(p.a) * D_DIATOMIC;
    const dy = Math.sin(p.a) * D_DIATOMIC;
    bond(p.x-dx, p.y-dy, p.x+dx, p.y+dy);
    sphere(p.x-dx, p.y-dy, R_ATOM, color);
    sphere(p.x+dx, p.y+dy, R_ATOM, color);
    label(letter, p.x-dx, p.y-dy, 11);
    label(letter, p.x+dx, p.y+dy, 11);
  }

  function drawCO2(p){
    const dx = Math.cos(p.a) * (D_DIATOMIC + 2);
    const dy = Math.sin(p.a) * (D_DIATOMIC + 2);
    bond(p.x-dx, p.y-dy, p.x, p.y);
    bond(p.x, p.y, p.x+dx, p.y+dy);
    sphere(p.x-dx, p.y-dy, R_ATOM, COL_O);
    sphere(p.x+dx, p.y+dy, R_ATOM, COL_O);
    sphere(p.x, p.y, R_ATOM-1, COL_C);
    label("O", p.x-dx, p.y-dy, 11);
    label("O", p.x+dx, p.y+dy, 11);
    label("C", p.x, p.y, 11);
  }

  function drawHUD(){
    ctx.fillStyle = "rgba(255,255,255,0.90)";
    ctx.fillRect(0,0,W,topHUD);
    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.beginPath();
    ctx.moveTo(0, topHUD-0.5);
    ctx.lineTo(W, topHUD-0.5);
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.86)";
    ctx.font = "14px Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    ctx.fillText(`Carbone solide restant : ${nC}    O₂ : ${nO2}    CO₂ : ${nCO2}    N₂ : ${nN2}`, 14, 18);

    let concl = "";
    if (!running) concl = "Prêt.";
    else if (nO2 === 0 && nC > 0) concl = "Réaction terminée : O₂ limitant ; carbone en excès (solide restant).";
    else if (nC === 0 && nO2 > 0) concl = "Réaction terminée : carbone limitant ; O₂ en excès.";
    else if (nC === 0 && nO2 === 0) concl = "Réaction terminée : proportions stœchiométriques.";
    else concl = "En cours : O₂ réagit au contact du tas ; N₂ spectateur.";

    ctx.fillText(concl, 14, 40);

    if (running && paused){
      ctx.textAlign = "right";
      ctx.fillText("⏸ pause", W-14, 18);
    }
  }

  function render(){
    ctx.clearRect(0,0,W,H);
    drawHUD();
    drawSolid();

    for (const p of gas){
      if (p.alive && p.kind==="N2") drawDiatomic(p, COL_N, "N");
    }
    for (const p of gas){
      if (p.alive && p.kind==="O2") drawDiatomic(p, COL_O, "O");
    }
    for (const p of gas){
      if (p.alive && p.kind==="CO2") drawCO2(p);
    }
  }

  let last = performance.now();
  function loop(now){
    const dt = Math.min(0.05, (now-last)/1000);
    last = now;

    if (running && !paused){
      stepGas(dt);

      const tempC = clamp(parseFloat(ui.temp.value||"20"), 0, 300);
      const rScale = tempToReactionScale(tempC);
      // tentatives de réaction par seconde ~ 8 à 10 à température ambiante ; plus si T augmente
      reactionAccumulator += (8 * rScale) * dt;

      let guard = 0;
      while (reactionAccumulator >= 1 && guard < 40){
        guard++;
        tryReactOne();
        reactionAccumulator -= 1;
      }
    }

    recount();
    render();
    requestAnimationFrame(loop);
  }

  // UI
  ui.start.addEventListener("click", () => {
    running = true;
    paused = false;
    ui.pause.disabled = false;
    ui.start.disabled = true;
    setStatus("Simulation en cours : augmente la température pour accélérer le déplacement des gaz.");
  });

  ui.pause.addEventListener("click", () => {
    paused = !paused;
    ui.pause.textContent = paused ? "Reprendre" : "Pause";
  });

  ui.reset.addEventListener("click", () => {
    resetFromUI();
  });

  ui.toggleLabels.addEventListener("click", () => {
    showLabels = !showLabels;
    ui.toggleLabels.textContent = showLabels ? "Masquer les symboles" : "Afficher les symboles";
    setStatus(showLabels ? "Symboles affichés." : "Modèles compacts sans symboles.");
  });

  // init
  resetFromUI();
  requestAnimationFrame(loop);
})();
