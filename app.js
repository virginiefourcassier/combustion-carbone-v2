(() => {
  // ==========================================
  // C(s) + O2 -> CO2 (gaz)
  // - Carbone : dépôt solide au fond (immobile)
  // - O2 : molécules rouges mobiles
  // - N2 : spectateur mobile
  // - CO2 : produit mobile (O rouges AVANT/APRÈS)
  // - Vue par défaut SANS symboles ; bouton pour les afficher
  // ==========================================

  const canvas = document.getElementById("sim");
  const ctx = canvas.getContext("2d");

  const ui = {
    c0: document.getElementById("c0"),
    o20: document.getElementById("o20"),
    n20: document.getElementById("n20"),
    speed: document.getElementById("speed"),
    start: document.getElementById("start"),
    pause: document.getElementById("pause"),
    reset: document.getElementById("reset"),
    toggleLabels: document.getElementById("toggleLabels"),
    status: document.getElementById("status"),
  };

  // ----- helpers
  const W = canvas.width, H = canvas.height;
  const topHUD = 62;
  const pad = 18;

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function rnd(a,b){ return a + Math.random()*(b-a); }
  function dist2(ax,ay,bx,by){ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; }

  // ----- state
  let running = false;
  let paused = false;
  let showLabels = false;

  // Particules mobiles: O2, N2, CO2
  // Carbone solide: liste de sites fixes (x,y,alive)
  let gas = [];
  let solidC = [];

  // Comptages
  let nC = 0, nO2 = 0, nN2 = 0, nCO2 = 0;

  // cadence max
  let reactionAccumulator = 0;

  // ----- creation
  function makeGas(kind){
    const base = {
      kind, // "O2" | "N2" | "CO2"
      x: rnd(pad, W-pad),
      y: rnd(topHUD+pad, H-pad-90),
      vx: rnd(-0.9, 0.9),
      vy: rnd(-0.7, 0.7),
      a: rnd(0, Math.PI*2),
      va: rnd(-0.03, 0.03),
      alive: true
    };
    if (kind === "O2") return { ...base, d: 12 };
    if (kind === "N2") return { ...base, d: 13 };
    if (kind === "CO2") return { ...base, d: 13 };
    return base;
  }

  // Dépôt "cristallin" : grille hexagonale simple au fond
  function buildSolidC(nSites){
    solidC = [];
    const r = 8;                     // rayon visuel d'un site C
    const dx = 2.25 * r;
    const dy = 1.95 * r;
    const floorY = H - pad - r;      // ligne du sol
    const maxRows = 7;

    // on remplit rangée par rangée, en décalant une rangée sur deux
    let placed = 0;
    for (let row = 0; row < maxRows && placed < nSites; row++){
      const y = floorY - row*dy;
      const offset = (row % 2 === 0) ? 0 : dx/2;
      for (let col = 0; col < 999 && placed < nSites; col++){
        const x = pad + r + offset + col*dx;
        if (x > W - pad - r) break;

        // léger jitter pour un aspect "cristallin" moins parfait
        const jx = rnd(-0.6, 0.6);
        const jy = rnd(-0.6, 0.6);

        solidC.push({ x: x + jx, y: y + jy, alive: true, r });
        placed++;
      }
    }

    // si on n'a pas pu placer assez (petits écrans), on complète avec une 2e couche plus compacte
    let guard = 0;
    while (placed < nSites && guard < 6000){
      guard++;
      const x = rnd(pad+r, W-pad-r);
      const y = rnd(floorY - (maxRows-1)*dy, floorY);
      // évite chevauchements trop forts
      let ok = true;
      for (const s of solidC){
        if (dist2(x,y,s.x,s.y) < (1.6*r)*(1.6*r)){ ok = false; break; }
      }
      if (ok){
        solidC.push({ x, y, alive:true, r });
        placed++;
      }
    }
  }

  function spawnGas(kind, n){
    for (let i=0;i<n;i++) gas.push(makeGas(kind));
  }

  function recount(){
    nC = solidC.filter(s=>s.alive).length;
    nO2 = gas.filter(p=>p.alive && p.kind==="O2").length;
    nN2 = gas.filter(p=>p.alive && p.kind==="N2").length;
    nCO2 = gas.filter(p=>p.alive && p.kind==="CO2").length;
  }

  function setStatus(html){ ui.status.innerHTML = html; }

  function resetFromUI(){
    running = false;
    paused = false;
    reactionAccumulator = 0;

    gas = [];
    const c0 = clamp(parseInt(ui.c0.value||"0",10), 10, 220);
    const o20 = clamp(parseInt(ui.o20.value||"0",10), 0, 160);
    const n20 = clamp(parseInt(ui.n20.value||"0",10), 0, 160);

    buildSolidC(c0);
    spawnGas("O2", o20);
    spawnGas("N2", n20);
    recount();

    ui.pause.disabled = true;
    ui.start.disabled = false;
    ui.pause.textContent = "Pause";

    // Diagnostic limitant/excès (stoéchio 1:1)
    let diag = "";
    if (o20 === 0) diag = "O₂ absent : aucune réaction possible.";
    else if (c0 === 0) diag = "Carbone absent : aucune réaction possible.";
    else if (o20 < c0) diag = "Attendu : O₂ limitant ; carbone en excès (il restera du solide).";
    else if (c0 < o20) diag = "Attendu : carbone limitant ; O₂ en excès.";
    else diag = "Attendu : proportions stœchiométriques (aucun excès).";

    setStatus(`Modèle moléculaire compact <b>sans symboles</b> par défaut.<br>${diag}`);
  }

  // ----- physics
  function bounceGas(p){
    const minX = pad, maxX = W-pad;
    const minY = topHUD+pad, maxY = H-pad;

    if (p.x < minX){ p.x = minX; p.vx *= -1; }
    if (p.x > maxX){ p.x = maxX; p.vx *= -1; }
    if (p.y < minY){ p.y = minY; p.vy *= -1; }
    if (p.y > maxY){ p.y = maxY; p.vy *= -1; }
  }

  function stepGas(dt){
    for (const p of gas){
      if (!p.alive) continue;
      p.x += p.vx;
      p.y += p.vy;
      p.a += p.va;
      bounceGas(p);

      // petite tendance à remonter pour les produits (effet convection)
      if (p.kind === "CO2") p.vy -= 0.02;
    }
  }

  function findNearestAliveSolid(x,y){
    let best = null;
    let bestd = Infinity;
    for (const s of solidC){
      if (!s.alive) continue;
      const d = dist2(x,y,s.x,s.y);
      if (d < bestd){ bestd = d; best = s; }
    }
    return { best, bestd };
  }

  // Réaction à la surface : O2 proche du dépôt + site C disponible => CO2 créé (gaz)
  function tryReactOne(){
    const o2s = gas.filter(p=>p.alive && p.kind==="O2");
    if (o2s.length === 0) return false;

    // prend un O2 au hasard
    const o2 = o2s[Math.floor(Math.random()*o2s.length)];

    // n'autorise la réaction que si l'O2 est dans la zone proche du dépôt
    const surfaceBandTop = H - 180;
    if (o2.y < surfaceBandTop) return false;

    // cherche un site C proche
    const { best, bestd } = findNearestAliveSolid(o2.x, o2.y);
    const threshold = 26*26;
    if (!best || bestd > threshold) return false;

    // Consomme 1 site C et 1 O2
    best.alive = false;
    o2.alive = false;

    // Produit : CO2 (gaz) au-dessus du site, avec vitesse vers le haut
    const co2 = makeGas("CO2");
    co2.x = best.x;
    co2.y = best.y - 18;
    co2.vx = rnd(-0.6, 0.6);
    co2.vy = rnd(-1.2, -0.4);
    gas.push(co2);
    return true;
  }

  // ----- drawing
  function drawSphere(x,y,r,fill){
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fill();
  }

  function drawLabel(txt,x,y,size){
    if (!showLabels) return;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `${size}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(txt,x,y);
  }

  function drawBond(x1,y1,x2,y2,stroke,width){
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.lineTo(x2,y2);
    ctx.stroke();
  }

  // Colors
  const colC = "rgba(25,25,25,0.80)";
  const colO = "rgba(210,40,40,0.82)";   // OXYGÈNES ROUGES partout
  const colN = "rgba(30,90,200,0.80)";
  const bondO = "rgba(210,40,40,0.55)";
  const bondN = "rgba(30,90,200,0.55)";
  const bondCO2 = "rgba(50,160,120,0.35)";

  function drawSolid(){
    // sol
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(0, H-pad-10, W, 20);

    // dépôt "cristallin"
    for (const s of solidC){
      if (!s.alive) continue;
      drawSphere(s.x, s.y, 9, colC);
      drawLabel("C", s.x, s.y, 11);
    }
  }

  function drawO2(p){
    const dx = Math.cos(p.a)*p.d;
    const dy = Math.sin(p.a)*p.d;
    drawBond(p.x-dx,p.y-dy,p.x+dx,p.y+dy,bondO,3);
    drawSphere(p.x-dx,p.y-dy,8,colO);
    drawSphere(p.x+dx,p.y+dy,8,colO);
    drawLabel("O", p.x-dx, p.y-dy, 10);
    drawLabel("O", p.x+dx, p.y+dy, 10);
  }

  function drawN2(p){
    const dx = Math.cos(p.a)*p.d;
    const dy = Math.sin(p.a)*p.d;
    drawBond(p.x-dx,p.y-dy,p.x+dx,p.y+dy,bondN,3);
    drawSphere(p.x-dx,p.y-dy,8,colN);
    drawSphere(p.x+dx,p.y+dy,8,colN);
    drawLabel("N", p.x-dx, p.y-dy, 10);
    drawLabel("N", p.x+dx, p.y+dy, 10);
  }

  function drawCO2(p){
    // Modèle compact simplifié O—C—O (3 boules)
    const dx = Math.cos(p.a)*p.d;
    const dy = Math.sin(p.a)*p.d;

    // liaisons (discrètes)
    drawBond(p.x-dx,p.y-dy,p.x,p.y,bondCO2,3);
    drawBond(p.x,p.y,p.x+dx,p.y+dy,bondCO2,3);

    // O rouges aux extrémités
    drawSphere(p.x-dx,p.y-dy,8,colO);
    drawSphere(p.x+dx,p.y+dy,8,colO);

    // C sombre au centre
    drawSphere(p.x,p.y,7,colC);

    drawLabel("O", p.x-dx, p.y-dy, 10);
    drawLabel("O", p.x+dx, p.y+dy, 10);
    drawLabel("C", p.x, p.y, 10);
  }

  function drawHUD(){
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fillRect(0,0,W,topHUD);

    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.beginPath();
    ctx.moveTo(0, topHUD-0.5);
    ctx.lineTo(W, topHUD-0.5);
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.86)";
    ctx.font = "14px Arial";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    const line1 = `Carbone solide restant : ${nC}    O₂ : ${nO2}    CO₂ : ${nCO2}    N₂ : ${nN2}`;
    ctx.fillText(line1, 14, 18);

    let concl = "";
    if (!running){
      concl = "Prêt.";
    } else if (nO2 === 0 && nC > 0){
      concl = "Réaction terminée : O₂ limitant ; carbone en excès (solide restant).";
    } else if (nC === 0 && nO2 > 0){
      concl = "Réaction terminée : carbone limitant ; O₂ en excès.";
    } else if (nC === 0 && nO2 === 0){
      concl = "Réaction terminée : proportions stœchiométriques.";
    } else {
      concl = "En cours : O₂ réagit au contact du dépôt ; N₂ spectateur.";
    }
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

    // gaz : N2 derrière, puis O2, puis CO2
    for (const p of gas){
      if (p.alive && p.kind === "N2") drawN2(p);
    }
    for (const p of gas){
      if (p.alive && p.kind === "O2") drawO2(p);
    }
    for (const p of gas){
      if (p.alive && p.kind === "CO2") drawCO2(p);
    }
  }

  // ----- main loop
  let last = performance.now();
  function loop(now){
    const dt = Math.min(0.05, (now-last)/1000);
    last = now;

    if (running && !paused){
      stepGas(dt);

      // cadence globale
      const speed = clamp(parseFloat(ui.speed.value||"0"), 0, 30);
      reactionAccumulator += speed * dt;

      let guard = 0;
      while (reactionAccumulator >= 1 && guard < 30){
        guard++;
        // on tente une réaction, mais on décrémente le budget même si échec (sinon boucle)
        tryReactOne();
        reactionAccumulator -= 1;
      }
    }

    recount();
    render();
    requestAnimationFrame(loop);
  }

  // ----- UI bindings
  ui.start.addEventListener("click", () => {
    running = true;
    paused = false;
    ui.pause.disabled = false;
    ui.start.disabled = true;
    setStatus("Simulation en cours. Le carbone solide reste immobile ; seules les molécules de gaz se déplacent.");
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
    setStatus(showLabels
      ? "Symboles affichés (C, O, N)."
      : "Modèle compact sans symboles (vue par défaut).");
  });

  // init
  resetFromUI();
  requestAnimationFrame(loop);
})();
