// ============================================================
//  game.js  –  Survival Encyclopedia  |  Scenario 1: Earthquake
// ============================================================

(function () {
  "use strict";

  const canvas = document.getElementById("game-canvas");
  if (!canvas) return;

  // ── Renderer ─────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1410);
  scene.fog = new THREE.Fog(0x1a1410, 18, 40);

  const camera = new THREE.PerspectiveCamera(72, canvas.clientWidth / canvas.clientHeight, 0.05, 100);
  camera.rotation.order = "YXZ";
  camera.position.set(0, 1.7, 0);  // spawn in open centre of room

  // ── Game state ────────────────────────────────────────────────
  const STATE = { CALM: 0, QUAKE: 1, DONE: 2 };
  let gameState      = STATE.CALM;
  let calmTimer      = 0;
  let quakeTimer     = 0;
  const CALM_DURATION  = 30;
  const QUAKE_DURATION = 25;

  let panic          = 50;
  let health         = 100;
  let isHiding       = false;
  let debrisCooldown = 0;
  let shakeIntensity = 0;
  const cameraBase   = new THREE.Vector3();

  // ── Crouch ────────────────────────────────────────────────────
  const EYE_STAND  = 1.7;
  const EYE_CROUCH = 0.75;
  let   isCrouching  = false;
  let   currentEyeY  = EYE_STAND;

  // ── Safe zones: under table, in doorframe ────────────────────
  const safeZones = [
    { center: new THREE.Vector3(-2.5, 0, 0.8), radius: 1.9 },
    { center: new THREE.Vector3(3.5,  0, 5.0), radius: 1.5 },
  ];

  // ── Debris pool ───────────────────────────────────────────────
  const debrisPool  = [];
  const activeDebris = [];

  // ── Lights ────────────────────────────────────────────────────
  const ambientLight = new THREE.AmbientLight(0xfff5e0, 0.55);
  scene.add(ambientLight);

  const ceilLight1 = new THREE.PointLight(0xfff0cc, 1.8, 14);
  ceilLight1.position.set(0, 2.7, 0);
  ceilLight1.castShadow = true;
  scene.add(ceilLight1);

  const ceilLight2 = new THREE.PointLight(0xfff0cc, 1.1, 9);
  ceilLight2.position.set(3, 2.7, -2);
  scene.add(ceilLight2);

  const windowGlow = new THREE.PointLight(0x8ab4e8, 0.6, 10);
  windowGlow.position.set(4.9, 1.8, -0.5);
  scene.add(windowGlow);

  // ── Materials ─────────────────────────────────────────────────
  const M = {
    wall:     new THREE.MeshLambertMaterial({ color: 0xd4c9b8 }),
    floor:    new THREE.MeshLambertMaterial({ color: 0x7a6347 }),
    ceiling:  new THREE.MeshLambertMaterial({ color: 0xc8bfb0 }),
    wood:     new THREE.MeshLambertMaterial({ color: 0x6b4c2a }),
    darkWood: new THREE.MeshLambertMaterial({ color: 0x3d2b14 }),
    sofa:     new THREE.MeshLambertMaterial({ color: 0x4a5568 }),
    sofaCush: new THREE.MeshLambertMaterial({ color: 0x5a6578 }),
    tableTop: new THREE.MeshLambertMaterial({ color: 0x5a3e22 }),
    tableLeg: new THREE.MeshLambertMaterial({ color: 0x7c5c3a }),
    window:   new THREE.MeshLambertMaterial({ color: 0x8ab4e8, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
    windowFr: new THREE.MeshLambertMaterial({ color: 0xd4c9b8 }),
    door:     new THREE.MeshLambertMaterial({ color: 0x8b6914 }),
    doorFr:   new THREE.MeshLambertMaterial({ color: 0xc8bfb0 }),
    rug:      new THREE.MeshLambertMaterial({ color: 0x8b2020 }),
    plant:    new THREE.MeshLambertMaterial({ color: 0x2d5a1b }),
    pot:      new THREE.MeshLambertMaterial({ color: 0x8b4513 }),
    book:     new THREE.MeshLambertMaterial({ color: 0x1a3a6b }),
    book2:    new THREE.MeshLambertMaterial({ color: 0x6b1a1a }),
    book3:    new THREE.MeshLambertMaterial({ color: 0x1a6b3a }),
    frame:    new THREE.MeshLambertMaterial({ color: 0x222222 }),
    bulb:     new THREE.MeshBasicMaterial({ color: 0xffffcc }),
    safe:     new THREE.MeshLambertMaterial({ color: 0x22c55e, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    plaster:  new THREE.MeshLambertMaterial({ color: 0xd4c9b8 }),
    concrete: new THREE.MeshLambertMaterial({ color: 0x888888 }),
    debris:   new THREE.MeshLambertMaterial({ color: 0x7c5c3a }),
  };

  const colliders = [];
  function addCollider(px, pz, hw, hd) {
    colliders.push({ minX: px-hw, maxX: px+hw, minZ: pz-hd, maxZ: pz+hd });
  }

  function b(w, h, d, mat, px, py, pz, rx, ry, rz) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(px, py, pz);
    if (rx || ry || rz) mesh.rotation.set(rx||0, ry||0, rz||0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // ── Room ──────────────────────────────────────────────────────
  const RW = 10, RH = 3, RD = 10;

  b(RW, 0.12, RD,   M.floor,   0, -0.06, 0);           
  b(RW, 0.12, RD,   M.ceiling, 0, RH+0.06, 0);         

  b(RW, RH, 0.12,   M.wall,    0, RH/2, -5);           
  b(0.12, RH, RD,   M.wall,    -5, RH/2, 0);           

  b(0.12, RH, 4,    M.wall,    5, 1.5, 3);             
  b(0.12, RH, 3,    M.wall,    5, 1.5, -3.5);          
  b(0.12, 0.85, 3,  M.wall,    5, 0.425, -0.5);        
  b(0.12, 0.5, 3,   M.wall,    5, 2.75, -0.5);         

  b(7.6, RH, 0.12,  M.wall,    -1.2, 1.5, 5);          
  b(0.6, RH, 0.12,  M.wall,    4.7, 1.5, 5);           
  b(1.8, 0.6, 0.12, M.wall,    3.5, 2.7, 5);           

  addCollider(0, -5, 5, 0.15);         
  addCollider(-5, 0, 0.15, 5);         
  addCollider(5, 3, 0.15, 2);          
  addCollider(5, -3.5, 0.15, 1.5);     
  addCollider(-1.2, 5, 3.8, 0.15);     
  addCollider(4.7, 5, 0.3, 0.15);      

  // ── Window & Doorframe ────────────────────────────────────────
  b(0.06, 1.65, 2.9, M.window,  5, 1.675, -0.5);
  b(0.14, 1.68, 0.1, M.windowFr, 5, 1.675,  0.95);
  b(0.14, 1.68, 0.1, M.windowFr, 5, 1.675, -1.95);
  b(0.14, 0.1,  3.0, M.windowFr, 5, 2.45, -0.5);
  b(0.14, 0.1,  3.0, M.windowFr, 5, 0.85, -0.5);

  b(0.14, 2.4, 0.18, M.doorFr,  2.65, 1.2, 5);
  b(0.14, 2.4, 0.18, M.doorFr,  4.35, 1.2, 5);
  b(1.7, 0.18, 0.18, M.doorFr,  3.5, 2.4, 5);
  b(1.65, 2.35, 0.1, M.door,    3.5, 1.18, 4.95);

  // ── Furniture ─────────────────────────────────────────────────
  b(4.5, 0.02, 3.5, M.rug, -1, 0.01, 0.8);

  b(3.4, 0.48, 1.0, M.sofa,    -1.5, 0.24, 3.0);
  b(3.4, 0.9,  0.24, M.sofa,   -1.5, 0.69, 2.52);
  b(0.24, 0.68, 1.0, M.sofa,   -3.1, 0.48, 3.0);
  b(0.24, 0.68, 1.0, M.sofa,    0.1, 0.48, 3.0);
  b(0.95, 0.1, 0.85, M.sofaCush,-2.5, 0.5, 3.0);
  b(0.95, 0.1, 0.85, M.sofaCush,-1.5, 0.5, 3.0);
  b(0.95, 0.1, 0.85, M.sofaCush,-0.5, 0.5, 3.0);
  addCollider(-1.5, 2.95, 1.75, 0.60);

  b(3.0, 0.1, 1.8, M.tableTop, -2.5, 1.1, 0.8);     
  b(0.1, 1.05, 0.1, M.tableLeg, -3.9, 0.525,  1.65);
  b(0.1, 1.05, 0.1, M.tableLeg, -1.1, 0.525,  1.65);
  b(0.1, 1.05, 0.1, M.tableLeg, -3.9, 0.525, -0.05);
  b(0.1, 1.05, 0.1, M.tableLeg, -1.1, 0.525, -0.05);
  
  addCollider(-3.9, 1.65, 0.15, 0.15);
  addCollider(-1.1, 1.65, 0.15, 0.15);
  addCollider(-3.9, -0.05, 0.15, 0.15);
  addCollider(-1.1, -0.05, 0.15, 0.15);

  b(2.8, 0.5, 0.55, M.darkWood,  0, 0.25, -4.9);
  b(0.1, 0.9, 0.55, M.darkWood, -1.3, 0.7, -4.9);
  b(0.1, 0.9, 0.55, M.darkWood,  1.3, 0.7, -4.9);
  b(2.8, 0.06, 0.55, M.darkWood, 0, 1.14, -4.9);
  b(1.9, 1.05, 0.08, M.frame,    0, 1.65, -4.86);
  addCollider(0, -4.9, 1.45, 0.32);

  const shX = -4.3, shZ = -3.5;
  b(0.05, 2.3, 0.38, M.wood, shX-0.6, 1.15, shZ);   
  b(0.05, 2.3, 0.38, M.wood, shX+0.6, 1.15, shZ);   
  b(1.25, 2.3, 0.05, M.wood, shX, 1.15, shZ-0.165); 
  
  const shelfY = [0.1, 0.8, 1.5, 2.2];
  shelfY.forEach(y => {
    b(1.15, 0.05, 0.33, M.wood, shX, y, shZ);
    b(0.12, 0.58, 0.3, M.book,  shX+0.2, y+0.31, shZ);
    b(0.12, 0.62, 0.3, M.book2, shX, y+0.33, shZ);
    b(0.12, 0.5,  0.3, M.book3, shX-0.2, y+0.27, shZ);
    b(0.12, 0.55, 0.3, M.book,  shX-0.35, y+0.3, shZ);
  });
  addCollider(shX, shZ, 0.65, 0.22); 

  b(0.32, 0.42, 0.32, M.pot,  -4.4, 0.21, 2.8);
  const plantM = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 8), M.plant);
  plantM.position.set(-4.4, 0.78, 2.8);
  plantM.castShadow = true;
  scene.add(plantM);

  b(0.16, 0.25, 0.16, M.frame, 0, RH-0.12, 0);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), M.bulb);
  bulb.position.set(0, RH-0.3, 0);
  scene.add(bulb);
  b(0.92, 0.68, 0.05, M.frame, -2.0, 1.65, -4.94);
  b(0.68, 0.52, 0.05, M.frame,  1.6, 1.72, -4.94);

  // ── Safe zone visualisers ─────────────────────────────────────
  const safeViz = safeZones.map(sz => {
    const geo  = new THREE.CircleGeometry(sz.radius, 32);
    const mesh = new THREE.Mesh(geo, M.safe.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(sz.center.x, 0.015, sz.center.z);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });

  const safeZoneMeshes = safeZones.map((sz) => {
    const grp = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.4, 6),
      new THREE.MeshBasicMaterial({ color: 0x4ade80 })
    );
    cone.position.y = -0.2;
    grp.add(cone);
    grp.position.set(sz.center.x, 2.4, sz.center.z);
    grp.visible = false;
    scene.add(grp);
    return grp;
  });

  // ── Debris pool init ──────────────────────────────────────────
  const debrisMats = [M.plaster, M.concrete, M.debris];
  for (let i = 0; i < 35; i++) {
    const s   = 0.07 + Math.random() * 0.25;
    const geo = Math.random() < 0.55
      ? new THREE.BoxGeometry(s, s*0.55, s*0.85)
      : new THREE.DodecahedronGeometry(s*0.6, 0);
    const mesh = new THREE.Mesh(geo, debrisMats[Math.floor(Math.random()*3)]);
    mesh.castShadow = true;
    mesh.visible    = false;
    mesh._vy        = 0;
    mesh._fallen    = false;
    scene.add(mesh);
    debrisPool.push(mesh);
  }

  // ── Controls ──────────────────────────────────────────────────
  const euler    = new THREE.Euler(0, 0, 0, "YXZ");
  let   isLocked = false;
  const PITCH_MAX = Math.PI / 2.2;

  canvas.addEventListener("click", () => {
    if (gameState !== STATE.DONE) canvas.requestPointerLock();
  });

  document.addEventListener("pointerlockchange", () => {
    isLocked = document.pointerLockElement === canvas;
    const hint = document.getElementById("game-hint");
    if (hint) hint.style.display = (isLocked || gameState === STATE.DONE) ? "none" : "flex";
  });

  document.addEventListener("mousemove", e => {
    if (!isLocked) return;
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= e.movementX * 0.004;
    euler.x -= e.movementY * 0.004;
    euler.x  = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, euler.x));
    camera.quaternion.setFromEuler(euler);
  });

  const keys = {};
  document.addEventListener("keydown", e => {
    keys[e.code] = true;
    if (e.code === "KeyC") {
      if (isCrouching) {
        const p = camera.position;
        const tbl = safeZones[0];
        const dx = p.x - tbl.center.x;
        const dz = p.z - tbl.center.z;
        const underTable = Math.sqrt(dx*dx + dz*dz) < tbl.radius;
        if (!underTable) isCrouching = false;
      } else {
        isCrouching = true;
      }
    }
  });
  document.addEventListener("keyup", e => { keys[e.code] = false; });

  // ── Movement & Collision logic ────────────────────────────────
  const SPEED  = 4.5;
  const P_RAD  = 0.3;
  const fwd    = new THREE.Vector3();
  const rgt    = new THREE.Vector3();
  const mdir   = new THREE.Vector3();
  const HW     = RW/2 - P_RAD;
  const HD     = RD/2 - P_RAD;

  function resolveColliders(px, pz) {
    for (const c of colliders) {
      const nearX = Math.max(c.minX, Math.min(c.maxX, px));
      const nearZ = Math.max(c.minZ, Math.min(c.maxZ, pz));
      const dx = px - nearX;
      const dz = pz - nearZ;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist < P_RAD && dist > 0) {
        const push = (P_RAD - dist) / dist;
        px += dx * push;
        pz += dz * push;
      } else if (dist === 0) {
        const overX = P_RAD - Math.abs(px - (c.minX + c.maxX) * 0.5);
        const overZ = P_RAD - Math.abs(pz - (c.minZ + c.maxZ) * 0.5);
        if (overX < overZ) px += (px < (c.minX+c.maxX)*0.5 ? -overX : overX);
        else               pz += (pz < (c.minZ+c.maxZ)*0.5 ? -overZ : overZ);
      }
    }
    return { px, pz };
  }

  function updateMovement(dt) {
    const targetEye = isCrouching ? EYE_CROUCH : EYE_STAND;
    currentEyeY += (targetEye - currentEyeY) * Math.min(1, dt * 12);

    const crouchMul = isCrouching ? 0.5 : 1.0;
    const spd = (gameState === STATE.QUAKE ? SPEED * 0.6 : SPEED) * crouchMul * dt;

    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    rgt.crossVectors(fwd, camera.up).normalize();
    mdir.set(0, 0, 0);
    if (keys["KeyW"]||keys["ArrowUp"])    mdir.add(fwd);
    if (keys["KeyS"]||keys["ArrowDown"])  mdir.sub(fwd);
    if (keys["KeyA"]||keys["ArrowLeft"])  mdir.sub(rgt);
    if (keys["KeyD"]||keys["ArrowRight"]) mdir.add(rgt);

    if (mdir.lengthSq() > 0) {
      mdir.normalize().multiplyScalar(spd);
      let nx = camera.position.x + mdir.x;
      let nz = camera.position.z;
      const rx = resolveColliders(nx, nz);
      nx = rx.px; nz = rx.pz;

      nz += mdir.z;
      const rz = resolveColliders(nx, nz);
      nx = rz.px; nz = rz.pz;

      camera.position.x = Math.max(-HW, Math.min(HW, nx));
      camera.position.z = Math.max(-HD, Math.min(HD, nz));
    }
    camera.position.y = currentEyeY;
  }

  function checkSafeZone() {
    const p = camera.position;
    return safeZones.some((sz, i) => {
      const dx   = p.x - sz.center.x;
      const dz   = p.z - sz.center.z;
      const inArea = Math.sqrt(dx*dx + dz*dz) < sz.radius;
      if (!inArea) return false;
      if (i === 0) return isCrouching;   // table: must crouch
      return true;                       // doorframe: any stance
    });
  }

  // ── Game Loops ────────────────────────────────────────────────
  function spawnDebris() {
    const chunk = debrisPool.find(d => !d.visible && d._fallen === false);
    if (!chunk) return;
    chunk.position.set(
      (Math.random()-0.5)*(RW-1.2),
      RH - 0.05,
      (Math.random()-0.5)*(RD-1.2)
    );
    chunk._vy     = 0;
    chunk._fallen = false;
    chunk.visible = true;
    chunk.rotation.set(Math.random()*6, Math.random()*6, Math.random()*6);
    activeDebris.push(chunk);
  }

  function updateDebris(dt) {
    for (let i = activeDebris.length-1; i >= 0; i--) {
      const d = activeDebris[i];
      if (d._fallen) continue;
      d._vy        -= 9.8 * dt;
      d.position.y += d._vy * dt;
      d.rotation.x += 1.5 * dt;
      d.rotation.z += 1.0 * dt;

      if (!isHiding) {
        const dx = d.position.x - camera.position.x;
        const dz = d.position.z - camera.position.z;
        if (Math.sqrt(dx*dx + dz*dz) < 0.65 && d.position.y < 2.2 && d.position.y > 0.5) {
          health  = Math.max(0, health - 14);
          panic   = Math.min(100, panic + 10);
          d._fallen = true;
          d.position.y = 0.1;
          flashScreen("rgba(220,30,30,0.4)", 350);
        }
      }

      if (d.position.y <= 0.1) {
        d.position.y = 0.1;
        d._fallen    = true;
      }
    }
  }

  function flashScreen(color, duration) {
    const wrapper = canvas.parentElement;
    const fl = document.createElement("div");
    fl.style.cssText = `position:absolute;inset:0;background:${color};
      pointer-events:none;z-index:60;transition:opacity ${duration}ms ease;`;
    wrapper.appendChild(fl);
    requestAnimationFrame(() => { fl.style.opacity = "0"; });
    setTimeout(() => fl.remove(), duration + 50);
  }

  // ── HUD Elements ──────────────────────────────────────────────
  let panicFill, healthFill, timerEl, statusEl, safeEl, outcomeEl;

  function buildHUD() {
    const wrapper = canvas.parentElement;
    if (getComputedStyle(wrapper).position === "static") wrapper.style.position = "relative";

    const hint = document.createElement("div");
    hint.id = "game-hint";
    hint.innerHTML = `
      <div class="gh-title">🏢 EARTHQUAKE SCENARIO</div>
      <div class="gh-sub">Click anywhere to enter</div>
      <div class="gh-keys">
        <span>WASD</span> Move &nbsp;·&nbsp;
        <span>Mouse</span> Look &nbsp;·&nbsp;
        <span>C</span> Crouch &nbsp;·&nbsp;
        <span>Esc</span> Exit
      </div>
      <div class="gh-warn">⚠ An earthquake will strike in 30 seconds. Find cover.</div>
    `;
    wrapper.appendChild(hint);

    const cross = document.createElement("div");
    cross.id = "game-crosshair";
    cross.innerHTML = `<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="8" stroke="rgba(255,255,255,.75)" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="16" x2="12" y2="22" stroke="rgba(255,255,255,.75)" stroke-width="1.5" stroke-linecap="round"/><line x1="2" y1="12" x2="8" y2="12" stroke="rgba(255,255,255,.75)" stroke-width="1.5" stroke-linecap="round"/><line x1="16" y1="12" x2="22" y2="12" stroke="rgba(255,255,255,.75)" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="1.2" fill="rgba(255,255,255,.6)"/></svg>`;
    cross.style.display = "none";
    wrapper.appendChild(cross);
    document.addEventListener("pointerlockchange", () => {
      cross.style.display = document.pointerLockElement === canvas ? "block" : "none";
    });

    const pw = document.createElement("div"); pw.id = "panic-wrap";
    pw.innerHTML = `<div id="panic-label">PANIC</div><div id="panic-bar"><div id="panic-fill"></div></div>`;
    wrapper.appendChild(pw);
    panicFill = document.getElementById("panic-fill");

    const hw = document.createElement("div"); hw.id = "health-wrap";
    hw.innerHTML = `<div id="health-label">HEALTH</div><div id="health-bar"><div id="health-fill"></div></div>`;
    wrapper.appendChild(hw);
    healthFill = document.getElementById("health-fill");

    timerEl = document.createElement("div"); timerEl.id = "game-timer";
    wrapper.appendChild(timerEl);

    statusEl = document.createElement("div"); statusEl.id = "game-status";
    statusEl.textContent = "Explore your apartment. Something feels off...";
    wrapper.appendChild(statusEl);

    safeEl = document.createElement("div"); safeEl.id = "safe-label";
    safeEl.textContent = "✓ SAFE — STAY HERE";
    safeEl.style.display = "none";
    wrapper.appendChild(safeEl);

    const crouchEl = document.createElement("div"); crouchEl.id = "crouch-indicator";
    crouchEl.textContent = "▼ CROUCHING";
    crouchEl.style.display = "none";
    wrapper.appendChild(crouchEl);

    outcomeEl = document.createElement("div"); outcomeEl.id = "outcome-screen";
    outcomeEl.style.display = "none";
    wrapper.appendChild(outcomeEl);
  }

  function updateHUD() {
    if (!panicFill) return;
    const p = panic / 100;
    panicFill.style.width = panic + "%";
    panicFill.style.background = `rgb(${Math.round(p*210)},${Math.round((1-p)*170+20)},20)`;

    const h = health / 100;
    healthFill.style.width = health + "%";
    healthFill.style.background = `rgb(${Math.round((1-h)*210)},${Math.round(h*170+20)},20)`;

    safeEl.style.display = (gameState === STATE.QUAKE && isHiding) ? "block" : "none";

    const crouchEl = document.getElementById("crouch-indicator");
    if (crouchEl) crouchEl.style.display = isCrouching ? "block" : "none";

    if (gameState === STATE.CALM) {
      const rem = Math.ceil(CALM_DURATION - calmTimer);
      timerEl.textContent  = "";
      statusEl.textContent = rem > 15
        ? "Explore your apartment. Something feels off..."
        : "⚠ The floor is trembling... brace yourself.";
      statusEl.style.color = rem > 15 ? "#d1c9bb" : "#fbbf24";
    }

    if (gameState === STATE.QUAKE) {
      timerEl.textContent = `QUAKE: ${Math.ceil(QUAKE_DURATION - quakeTimer)}s`;
      const p = camera.position;
      const dx = p.x - safeZones[0].center.x;
      const dz = p.z - safeZones[0].center.z;
      const inTableArea = Math.sqrt(dx*dx + dz*dz) < safeZones[0].radius;
      
      if (isHiding) {
        statusEl.textContent = "✓ Stay hidden! Wait for it to pass...";
        statusEl.style.color = "#4ade80";
      } else if (inTableArea && !isCrouching) {
        statusEl.textContent = "⬇ CROUCH [C] to get under the table!";
        statusEl.style.color = "#fbbf24";
      } else {
        statusEl.textContent = "⚠ GET UNDER THE TABLE [C] OR IN THE DOORFRAME!";
        statusEl.style.color = "#f87171";
      }
    }
  }

  function showOutcome() {
    gameState = STATE.DONE;
    document.exitPointerLock();
    const hint = document.getElementById("game-hint");
    if (hint) hint.style.display = "none";

    let title, body, panicResult, accent;
    if (health <= 0) {
      title = "YOU DIDN'T SURVIVE";
      body  = "Panic overwhelmed you. Falling debris struck before you found cover. Knowing where to shelter beforehand could have saved your life.";
      panicResult = "Panic: CRITICAL — 100%";
      accent = "#ef4444";
    } else if (panic >= 75) {
      title = "SURVIVED — HIGH PANIC";
      body  = "You made it out, but barely. Hesitating in the open cost you health and let panic spiral. Next time: table or doorframe, immediately.";
      panicResult = `Panic: HIGH — ${Math.round(panic)}%`;
      accent = "#f97316";
    } else if (panic >= 40) {
      title = "SURVIVED";
      body  = "Good instincts. You found cover and rode it out. A little quicker next time and your panic could stay much lower.";
      panicResult = `Panic: MODERATE — ${Math.round(panic)}%`;
      accent = "#facc15";
    } else {
      title = "SURVIVED — CALM & SAFE";
      body  = "Excellent. You reacted immediately, sheltered correctly, and stayed composed throughout. The Survival Encyclopedia's method works.";
      panicResult = `Panic: LOW — ${Math.round(panic)}%`;
      accent = "#4ade80";
    }

    outcomeEl.style.display = "flex";
    outcomeEl.innerHTML = `
      <div class="outcome-box">
        <div class="outcome-badge" style="background:${accent}22;border-color:${accent}55">SCENARIO COMPLETE</div>
        <div class="outcome-title" style="color:${accent}">${title}</div>
        <div class="outcome-body">${body}</div>
        <div class="outcome-stats">
          <div class="outcome-stat" style="color:${accent}">${panicResult}</div>
          <div class="outcome-stat">Health remaining: <strong>${Math.max(0,Math.round(health))}%</strong></div>
        </div>
        <button class="outcome-btn" onclick="location.reload()">↩ Try Again</button>
      </div>
    `;
  }

  buildHUD();

  window.addEventListener("resize", () => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  });

  let lastTime = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);
    if (gameState === STATE.DONE) { renderer.render(scene, camera); return; }

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime  = now;
    const t   = now * 0.001;

    updateMovement(dt);

    if (gameState === STATE.CALM) {
      calmTimer += dt;
      panic += (48 - panic) * 0.5 * dt;

      if (calmTimer > CALM_DURATION - 8) {
        const strength = (calmTimer - (CALM_DURATION - 8)) / 8;
        camera.position.x += (Math.random()-0.5) * 0.004 * strength;
        camera.position.z += (Math.random()-0.5) * 0.004 * strength;
      }

      if (calmTimer >= CALM_DURATION) {
        gameState = STATE.QUAKE;
        safeViz.forEach(v => v.visible = true);
        safeZoneMeshes.forEach(v => v.visible = true);
        flashScreen("rgba(255,200,40,0.55)", 500);
      }
    }

    if (gameState === STATE.QUAKE) {
      quakeTimer += dt;
      const progress = quakeTimer / QUAKE_DURATION;
      const ramp     = Math.min(1, quakeTimer / 3);
      const ease     = progress > 0.8 ? 1 - (progress - 0.8) / 0.2 : 1;
      shakeIntensity  = 0.14 * ramp * ease;

      cameraBase.copy(camera.position);
      camera.position.x += (Math.random()-0.5) * shakeIntensity * 2.2;
      camera.position.y  = currentEyeY + (Math.random()-0.5) * shakeIntensity * 0.8;
      camera.position.z += (Math.random()-0.5) * shakeIntensity * 2.2;
      camera.rotation.z = (Math.random()-0.5) * shakeIntensity * 0.6;

      isHiding = checkSafeZone();

      // NEW LOGIC: Drains health and spikes panic if you aren't hiding!
      if (isHiding) {
        panic = Math.max(0, panic - 20 * dt);
      } else {
        panic = Math.min(100, panic + 25 * dt); // Panic goes up much faster
        health = Math.max(0, health - 5 * dt);  // You lose 5 health per second of exposure
        
        // Randomly flash the screen red slightly to indicate getting hit by small debris/dust
        if (Math.random() < 0.08) {
          flashScreen("rgba(220,30,30,0.15)", 100);
        }
      }

      debrisCooldown -= dt;
      if (debrisCooldown <= 0) {
        const rate = Math.max(0.18, 0.7 - quakeTimer * 0.015);
        debrisCooldown = rate;
        spawnDebris();
        if (quakeTimer > 8) spawnDebris(); 
      }
      updateDebris(dt);

      ceilLight1.intensity = 1.8 + Math.sin(t * 22 + Math.random()) * 1.0 * ramp;
      ceilLight2.intensity = 1.1 + Math.sin(t * 17) * 0.6 * ramp;

      safeViz.forEach(v => {
        v.material.opacity = isHiding ? 0.35 : 0.18 + Math.sin(t*3)*0.08;
      });
      safeZoneMeshes.forEach(v => {
        v.position.y = 2.4 + Math.sin(t*2)*0.15;
      });

      if (health <= 0 || quakeTimer >= QUAKE_DURATION) {
        showOutcome();
        return;
      }

      renderer.render(scene, camera);
      camera.position.copy(cameraBase);
      camera.position.y = currentEyeY;
      camera.rotation.z = 0;

      updateHUD();
      return;
    }

    updateHUD();
    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);

})();