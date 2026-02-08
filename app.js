(() => {
  // ===========================
  // Simulation C + O2 -> CO2
  // N2 spectateur (ne réagit pas)
  // ===========================

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
    status: document.getElementById("status"),
  };

  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function rnd(a,b){ return a + Math.random()*(b-a); }
  function dist2(ax,ay,bx,by){ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; }

  // World
  const W = canvas.width, H = canvas.height;
  const topHUD = 58;          // bandeau haut
  const padding = 18;

  // Particules
  // kind: "C" | "O2" | "N2" | "CO2"
  // For diatomics, we store angle a and separation d
  let particles = [];
  let running = false;
  let paused = false;

  // Comptages (discrets)
  let nC = 0, nO2 = 0, nN2 = 0, nCO2 = 0;

  // Pour gérer une vitesse de réaction "globale" (événements/s)
  let reactionAccumulator = 0;

  function makeParticle(kind){
    const base = {
      kind,
      x: rnd(padding, W-padding),
      y: rnd(topHUD+padding, H-padding),
      vx: rnd(-0.9, 0.9),
      vy: rnd(-0.9, 0.9),
      alive: true,
    };

    if (kind === "C") return { ...base, r: 8 };
    if (kind === "O2") return { ...base, r: 7, a: rnd(0, Math.PI*2), va: rnd(-0.03, 0.03), d: 12 };
    if (kind === "N2") return { ...base, r: 7, a: rnd(0, Math.PI*2), va: rnd(-0.03, 0.03), d: 13 };
    if (kind === "CO2") return { ...base, r: 7, a: rnd(0, Math.PI*2), va: rnd(-0.02, 0.02), d: 12 }; // linéaire O-C-O simplifié
    return base;
  }

  function spawn(kind, n){
    for(let i=0;i<n;i++) particles.push(makeParticle(kind));
  }

  function recount(){
    nC = particles.filter(p=>p.alive && p.kind==="C").length;
    nO2 = particles.filter(p=>p.alive && p.kind==="O2").length;
    nN2 = particles.filter(p=>p.alive && p.kind==="N2").length;
    nCO2 = particles.filter(p=>p.alive && p.kind==="CO2").length;
  }

  function setStatus(html){ ui.status.innerHTML = html; }

  function resetFromUI(){
    running = false;
    paused = false;
    reactionAccumulator = 0;
    particles = [];

    const c0 = clamp(parseInt(ui.c0.value || "0", 10), 0, 200);
    const o20 = clamp(parseInt(ui.o20.value || "0", 10), 0, 200);
    const n20 = clamp(parseInt(ui.n20.value || "0", 10), 0, 200);

    spawn("C", c0);
    spawn("O2", o20);
    spawn("N2", n20);
    recount();

    ui.pause.disabled = true;
    ui.start.disabled = false;

    // Diagnostic "limitant/excès" à partir des quantités initiales (stoéchio 1:1)
    let diag = "";
    if (o20 === 0 && c0 === 0) diag = "Aucun réactif.";
    else if (o20 === 0) diag = "O₂ est absent : aucune réaction possible.";
    else if (c0 === 0) diag = "C est absent : aucune réaction possible.";
    else if (o20 < c0) diag = "Attendu : O₂ limitant ; C en excès.";
    else if (c0 < o20) diag = "Attendu : C limitant ; O₂ en excès.";
    else diag = "Attendu : proportions stœchiométriques (aucun excès).";

    setStatus(`Configure les quantités puis clique sur <b>Démarrer</b>.<br>${diag}`);
  }

  function consumeOne(kind){
    const idx = particles.findIndex(p => p.alive && p.kind === kind);
    if (idx >= 0) particles[idx].alive = false;
    return idx >= 0;
  }

  // Réaction par rencontres : si un C et un O2 sont suffisamment proches, on consomme les deux et on crée un CO2
  // En plus : on impose une cadence max via speed (événements/s) pour garder un rendu lisible.
  function tryReactOne(){
    // Trouve une paire C/O2 proche
    const cs = particles.filter(p=>p.alive && p.kind==="C");
    const o2s = particles.filter(p=>p.alive && p.kind==="O2");
    if (cs.length === 0 || o2s.length === 0) return false;

    // Stratégie simple : prend un O2 au hasard et cherche un C proche
    const o2 = o2s[Math.floor(Math.random()*o2s.length)];
    let best = null;
    let bestd = Infinity;
    for (const c of cs){
      const d = dist2(c.x,c.y,o2.x,o2.y);
      if (d < bestd){ bestd = d; best = c; }
    }
    const threshold = 28*28;
    if (best && bestd <= threshold){
      // Consommer
      best.alive = false;
      o2.alive = false;

      // Créer un CO2 au point moyen
      const co2 = makeParticle("CO2");
      co2.x = (best.x + o2.x)/2;
      co2.y = (best.y + o2.y)/2;
      co2.vx = (best.vx + o2.vx)/2;
      co2.vy = (best.vy + o2.vy)/2;
      particles.push(co2);
      return true;
    }
    return false;
  }

  function bounce(p){
    const minX = padding, maxX = W-padding;
    const minY = topHUD+padding, maxY = H-padding;

    if (p.x < minX){ p.x = minX; p.vx *= -1; }
    if (p.x > maxX){ p.x = maxX; p.vx *= -1; }
    if (p.y < minY){ p.y = minY; p.vy *= -1; }
    if (p.y > maxY){ p.y = maxY; p.vy *= -1; }
  }

  function drawHUD(){
    // fond bandeau
    ctx.fillStyle = "rgba(255,255,255,0.86)";
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

    const line1 = `n(C)=${nC}   n(O₂)=${nO2}   n(CO₂)=${nCO2}   n(N₂)=${nN2}`;
    ctx.fillText(line1, 14, 18);

    // Conclusion automatique
    let concl = "";
    if (!running){
      concl = "Prêt.";
    } else if (nC === 0 && nO2 === 0){
      concl = "Réaction terminée : proportions stœchiométriques.";
    } else if (nO2 === 0 && nC > 0){
      concl = "Réaction terminée : O₂ limitant ; C en excès (C restant).";
    } else if (nC === 0 && nO2 > 0){
      concl = "Réaction terminée : C limitant ; O₂ en excès (O₂ restant).";
    } else {
      concl = "En cours : collisions C/O₂ → CO₂ ; N₂ spectateur.";
    }
    ctx.fillText(concl, 14, 40);

    // Petit indicateur pause
    if (running && paused){
      ctx.textAlign = "right";
      ctx.fillText("⏸ pause", W-14, 18);
    }
  }

  function drawParticle(p){
    if (!p.alive) return;

    if (p.kind === "C"){
      ctx.fillStyle = "rgba(25,25,25,0.78)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "11px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("C", p.x, p.y);
      return;
    }

    if (p.kind === "O2" || p.kind === "N2"){
      p.a += p.va;
      const dx = Math.cos(p.a)*p.d;
      const dy = Math.sin(p.a)*p.d;

      ctx.lineWidth = 3;
      ctx.strokeStyle = (p.kind==="O2") ? "rgba(210,40,40,0.50)" : "rgba(30,90,200,0.50)";
      ctx.beginPath();
      ctx.moveTo(p.x-dx, p.y-dy);
      ctx.lineTo(p.x+dx, p.y+dy);
      ctx.stroke();

      ctx.fillStyle = (p.kind==="O2") ? "rgba(210,40,40,0.78)" : "rgba(30,90,200,0.78)";
      ctx.beginPath(); ctx.arc(p.x-dx, p.y-dy, 8, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x+dx, p.y+dy, 8, 0, Math.PI*2); ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "10px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const letter = (p.kind==="O2") ? "O" : "N";
      ctx.fillText(letter, p.x-dx, p.y-dy);
      ctx.fillText(letter, p.x+dx, p.y+dy);
      return;
    }

    if (p.kind === "CO2"){
      // représentation simplifiée O-C-O (3 atomes)
      p.a += p.va;
      const dx = Math.cos(p.a)*p.d;
      const dy = Math.sin(p.a)*p.d;

      // liaisons
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(50,160,120,0.45)";
      ctx.beginPath();
      ctx.moveTo(p.x-dx, p.y-dy);
      ctx.lineTo(p.x, p.y);
      ctx.lineTo(p.x+dx, p.y+dy);
      ctx.stroke();

      // O extrémités
      ctx.fillStyle = "rgba(50,160,120,0.78)";
      ctx.beginPath(); ctx.arc(p.x-dx, p.y-dy, 8, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x+dx, p.y+dy, 8, 0, Math.PI*2); ctx.fill();
      // C central
      ctx.fillStyle = "rgba(25,25,25,0.72)";
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI*2); ctx.fill();

      // lettres
      ctx.fillStyle = "rgba(255,255,255,0.86)";
      ctx.font = "10px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("O", p.x-dx, p.y-dy);
      ctx.fillText("O", p.x+dx, p.y+dy);
      ctx.fillText("C", p.x, p.y);
      return;
    }
  }

  function stepPhysics(dt){
    for (const p of particles){
      if (!p.alive) continue;
      p.x += p.vx;
      p.y += p.vy;
      bounce(p);
    }

    // Réaction cadence-limite
    const speed = clamp(parseFloat(ui.speed.value || "0"), 0, 20);
    reactionAccumulator += speed * dt;

    // Tant qu'il y a "budget" d'événements, on essaie de déclencher une réaction
    // (peut échouer si les particules sont éloignées)
    let guard = 0;
    while (reactionAccumulator >= 1 && guard < 20){
      guard++;
      const ok = tryReactOne();
      // On consomme 1 unité de budget même si ça échoue, sinon on peut boucler trop longtemps
      reactionAccumulator -= 1;
      if (ok){
        // rien d'autre
      }
    }
  }

  function tidy(){
    // Optionnel : retirer les morts pour performance
    if (particles.length > 600){
      particles = particles.filter(p=>p.alive);
    }
  }

  let last = performance.now();
  function loop(now){
    const dt = Math.min(0.05, (now-last)/1000);
    last = now;

    // fond
    ctx.clearRect(0,0,W,H);

    if (running && !paused){
      stepPhysics(dt);
      tidy();
    }

    // Recompte + arrêt si fini
    recount();
    if (running && (nC === 0 || nO2 === 0)){
      // si l'un des réactifs est épuisé, on laisse tourner 0.5 s pour "stabiliser"
      // mais on considère la réaction terminée (pas d'arrêt automatique de l'animation)
    }

    drawHUD();

    // Dessiner dans l'ordre : N2 derrière, puis O2, puis C, puis CO2
    for (const kind of ["N2","O2","C","CO2"]){
      for (const p of particles){
        if (p.alive && p.kind === kind) drawParticle(p);
      }
    }

    requestAnimationFrame(loop);
  }

  // UI
  ui.start.addEventListener("click", () => {
    running = true;
    paused = false;
    ui.pause.disabled = false;
    ui.start.disabled = true;
    setStatus("Simulation en cours. Utilise <b>Pause</b> si besoin.");
  });

  ui.pause.addEventListener("click", () => {
    paused = !paused;
    ui.pause.textContent = paused ? "Reprendre" : "Pause";
  });

  ui.reset.addEventListener("click", () => {
    ui.pause.textContent = "Pause";
    resetFromUI();
  });

  // init
  resetFromUI();
  requestAnimationFrame(loop);
})();
