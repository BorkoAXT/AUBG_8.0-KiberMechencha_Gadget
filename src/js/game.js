// ============================================================
//  game.js  –  Survival Encyclopedia  |  Scenario 1: Earthquake
// ============================================================

(function () {
  "use strict";

  const canvas = document.getElementById("game-canvas");
  if (!canvas) return;

  // ── Renderer ────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1410);
  scene.fog = new THREE.Fog(0x1a1410, 20, 44);

  const camera = new THREE.PerspectiveCamera(72, canvas.clientWidth / canvas.clientHeight, 0.05, 100);
  camera.rotation.order = "YXZ";
  camera.position.set(0, 1.7, 0);

  // ── Procedural Audio Engine ─────────────────────────────────
  const listener = new THREE.AudioListener();
  camera.add(listener);

  const sounds = {
    rumble: new THREE.Audio(listener),
    crash: new THREE.Audio(listener),
    heartbeat: new THREE.Audio(listener)
  };

  const audioCtx = THREE.AudioContext.getContext();

  // 1. Generate Deep Earthquake Rumble (Brownian Noise)
  function createRumbleBuffer() {
    const len = audioCtx.sampleRate * 2; // 2 seconds, loops perfectly
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < len; i++) {
      let white = Math.random() * 2 - 1;
      // Leaky integrator creates deep low-frequency noise
      lastOut = (lastOut + 0.02 * white) / 1.02; 
      data[i] = lastOut * 3.5; // Boost gain
    }
    return buf;
  }

  // 2. Generate Debris Crash (Crunchy decay noise)
  function createCrashBuffer() {
    const len = audioCtx.sampleRate * 0.6; // 0.6 seconds long
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < len; i++) {
      let white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.3 * white) / 1.3; // Milder filter for "crunch"
      // Exponential decay envelope
      let envelope = Math.exp(-i / (audioCtx.sampleRate * 0.08));
      data[i] = lastOut * envelope * 2.0;
    }
    return buf;
  }

  // 3. Generate Panic Heartbeat (Dual Sine Wave Thump)
  function createHeartbeatBuffer() {
    const len = audioCtx.sampleRate * 1.0; // 1 beat per second (60 BPM)
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / audioCtx.sampleRate;
      // Lub...
      const env1 = Math.exp(-t * 15);
      // ...Dub
      const env2 = t > 0.25 ? Math.exp(-(t - 0.25) * 15) : 0;
      // 40Hz Sine wave produces a heavy chest thump
      data[i] = Math.sin(t * 40 * Math.PI * 2) * (env1 + env2) * 1.5;
    }
    return buf;
  }

  // Apply generated buffers to audio sources
  sounds.rumble.setBuffer(createRumbleBuffer());
  sounds.rumble.setLoop(true);
  sounds.rumble.setVolume(0);

  sounds.crash.setBuffer(createCrashBuffer());
  sounds.crash.setVolume(0.8);

  sounds.heartbeat.setBuffer(createHeartbeatBuffer());
  sounds.heartbeat.setLoop(true);
  sounds.heartbeat.setVolume(0);


  // ── Game state ──────────────────────────────────────────────
  const STATE = { CALM: 0, QUAKE: 1, DONE: 2 };
  let gameState = STATE.CALM;
  let calmTimer = 0;
  let quakeTimer = 0;
  const CALM_DURATION = 30;
  const QUAKE_DURATION = 25;

  let panic = 50;
  let health = 100;
  let isHiding = false;
  let debrisCooldown = 0;
  let shakeIntensity = 0;
  const cameraBase = new THREE.Vector3();

  // ── Crouch ──────────────────────────────────────────────────
  const EYE_STAND = 1.7;
  const EYE_CROUCH = 0.75;
  let isCrouching = false;
  let currentEyeY = EYE_STAND;

  const safeZones = [
    { center: new THREE.Vector3(-2.5, 0, 0.8), radius: 1.9 },
    { center: new THREE.Vector3(3.5, 0, 5.0), radius: 1.5 },
    { center: new THREE.Vector3(-3.5, 0, 7.5), radius: 1.2 },
  ];

  const debrisPool = [];
  const activeDebris = [];

  // ── Materials ───────────────────────────────────────────────
  const M = {
    wall: new THREE.MeshStandardMaterial({ color: 0xd4c9b8, roughness: 0.95, metalness: 0.0 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x7a6347, roughness: 0.92, metalness: 0.0 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xc8bfb0, roughness: 0.95, metalness: 0.0 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4c2a, roughness: 0.88, metalness: 0.0 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x3d2b14, roughness: 0.9, metalness: 0.0 }),
    sofa: new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.95, metalness: 0.0 }),
    sofaCush: new THREE.MeshStandardMaterial({ color: 0x5a6578, roughness: 0.98, metalness: 0.0 }),
    tableTop: new THREE.MeshStandardMaterial({ color: 0x5a3e22, roughness: 0.88, metalness: 0.0 }),
    tableLeg: new THREE.MeshStandardMaterial({ color: 0x7c5c3a, roughness: 0.85, metalness: 0.0 }),
    window: new THREE.MeshLambertMaterial({ color: 0x8ab4e8, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
    windowFr: new THREE.MeshLambertMaterial({ color: 0xd4c9b8 }),
    door: new THREE.MeshLambertMaterial({ color: 0x8b6914 }),
    doorFr: new THREE.MeshLambertMaterial({ color: 0xc8bfb0 }),
    rug: new THREE.MeshLambertMaterial({ color: 0x8b2020 }),
    plant: new THREE.MeshLambertMaterial({ color: 0x2d5a1b }),
    pot: new THREE.MeshLambertMaterial({ color: 0x8b4513 }),
    book: new THREE.MeshLambertMaterial({ color: 0x1a3a6b }),
    book2: new THREE.MeshLambertMaterial({ color: 0x6b1a1a }),
    book3: new THREE.MeshLambertMaterial({ color: 0x1a6b3a }),
    frame: new THREE.MeshLambertMaterial({ color: 0x222222 }),
    safe: new THREE.MeshLambertMaterial({ color: 0x22c55e, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    plaster: new THREE.MeshLambertMaterial({ color: 0xd4c9b8 }),
    concrete: new THREE.MeshLambertMaterial({ color: 0x888888 }),
    debris: new THREE.MeshLambertMaterial({ color: 0x7c5c3a }),
    bed: new THREE.MeshLambertMaterial({ color: 0xeeeeee }),
    blanket: new THREE.MeshLambertMaterial({ color: 0x3b5998 }),
    handle: new THREE.MeshStandardMaterial({ color: 0x8c8c8c, roughness: 0.45, metalness: 0.9 }),
    wardrobePanel: new THREE.MeshStandardMaterial({ color: 0x4a321c, roughness: 0.9, metalness: 0.0 }),
  };

  // ── Lights ──────────────────────────────────────────────────
  const ambientLight = new THREE.AmbientLight(0xffedd1, 0.12);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xfff4dc, 0x2c241d, 0.38);
  scene.add(hemiLight);

  const ceilLight1 = new THREE.PointLight(0xffe8b8, 1.45, 15);
  ceilLight1.position.set(0, 2.55, 0);
  ceilLight1.castShadow = true;
  ceilLight1.shadow.mapSize.width = 1024;
  ceilLight1.shadow.mapSize.height = 1024;
  ceilLight1.shadow.bias = -0.0015;
  ceilLight1.shadow.radius = 4;
  scene.add(ceilLight1);

  const ceilLight3 = new THREE.PointLight(0xffe8b8, 1.3, 15);
  ceilLight3.position.set(0, 2.55, 10);
  ceilLight3.castShadow = true;
  ceilLight3.shadow.mapSize.width = 1024;
  ceilLight3.shadow.mapSize.height = 1024;
  ceilLight3.shadow.bias = -0.0015;
  ceilLight3.shadow.radius = 4;
  scene.add(ceilLight3);

  const livingFill = new THREE.PointLight(0xffd7a3, 0.18, 7);
  livingFill.position.set(-2.2, 1.4, 1.5);
  scene.add(livingFill);

  const bedroomFill = new THREE.PointLight(0xffd7a3, 0.14, 6);
  bedroomFill.position.set(1.5, 1.3, 12.5);
  scene.add(bedroomFill);

  const windowGlow = new THREE.PointLight(0x9cc8ff, 0.45, 10);
  windowGlow.position.set(4.4, 1.9, -0.5);
  scene.add(windowGlow);

  const moonLight = new THREE.DirectionalLight(0x8fb6ff, 0.12);
  moonLight.position.set(8, 6, -2);
  scene.add(moonLight);

  ceilLight1.intensity = 1.35;
  ceilLight3.intensity = 1.2;

  const colliders = [];
  function addCollider(px, pz, hw, hd, crouchPassable = false) {
    colliders.push({ minX: px - hw, maxX: px + hw, minZ: pz - hd, maxZ: pz + hd, crouchPassable });
  }

  function b(w, h, d, mat, px, py, pz, rx, ry, rz) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(px, py, pz);
    if (rx || ry || rz) mesh.rotation.set(rx || 0, ry || 0, rz || 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // ── LIVING ROOM ARCHITECTURE ────────────────────────────────
  const RW = 10, RH = 3, RD = 10;
  b(RW, 0.12, RD, M.floor, 0, -0.06, 0);
  b(RW, 0.12, RD, M.ceiling, 0, RH + 0.06, 0);
  b(RW, RH, 0.12, M.wall, 0, RH / 2, -5);
  b(0.12, RH, RD, M.wall, -5, RH / 2, 0);
  b(0.12, RH, 4, M.wall, 5, 1.5, 3);
  b(0.12, RH, 3, M.wall, 5, 1.5, -3.5);
  b(0.12, 0.85, 3, M.wall, 5, 0.425, -0.5);
  b(0.12, 0.5, 3, M.wall, 5, 2.75, -0.5);

  b(7.6, RH, 0.12, M.wall, -1.2, 1.5, 5);
  b(0.6, RH, 0.12, M.wall, 4.7, 1.5, 5);
  b(1.8, 0.6, 0.12, M.wall, 3.5, 2.7, 5);

  addCollider(0, -5, 5, 0.15);
  addCollider(-5, 0, 0.15, 5);
  addCollider(5, 3, 0.15, 2);
  addCollider(5, -3.5, 0.15, 1.5);
  addCollider(-1.2, 5, 3.8, 0.15);
  addCollider(4.7, 5, 0.3, 0.15);

  b(0.06, 1.65, 2.9, M.window, 5, 1.675, -0.5);
  b(0.14, 1.68, 0.1, M.windowFr, 5, 1.675, 0.95);
  b(0.14, 1.68, 0.1, M.windowFr, 5, 1.675, -1.95);
  b(0.14, 0.1, 3.0, M.windowFr, 5, 2.45, -0.5);
  b(0.14, 0.1, 3.0, M.windowFr, 5, 0.85, -0.5);
  b(0.14, 2.4, 0.18, M.doorFr, 2.65, 1.2, 5);
  b(0.14, 2.4, 0.18, M.doorFr, 4.35, 1.2, 5);
  b(1.7, 0.18, 0.18, M.doorFr, 3.5, 2.4, 5);

  b(0.1, 2.35, 1.65, M.door, 2.7, 1.18, 5.825);
  addCollider(2.7, 5.825, 0.1, 0.825);

  b(0.16, 0.25, 0.16, M.frame, 0, RH - 0.12, 0);
  const bulb1Mat = new THREE.MeshBasicMaterial({ color: 0xffffee });
  const bulb1Mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), bulb1Mat);
  bulb1Mesh.position.set(0, 2.7, 0);
  scene.add(bulb1Mesh);

  // ── BEDROOM ARCHITECTURE ────────────────────────────────────
  b(RW, 0.12, RD, M.floor, 0, -0.06, 10);
  b(RW, 0.12, RD, M.ceiling, 0, RH + 0.06, 10);
  b(0.12, RH, RD, M.wall, -5, RH / 2, 10);
  b(0.12, RH, RD, M.wall, 5, RH / 2, 10);
  b(RW, RH, 0.12, M.wall, 0, RH / 2, 15);

  addCollider(-5, 10, 0.15, 5);
  addCollider(5, 10, 0.15, 5);
  addCollider(0, 15, 5, 0.15);

  b(0.16, 0.25, 0.16, M.frame, 0, RH - 0.12, 10);
  const bulb2Mat = new THREE.MeshBasicMaterial({ color: 0xffffee });
  const bulb2Mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), bulb2Mat);
  bulb2Mesh.position.set(0, 2.7, 10);
  scene.add(bulb2Mesh);

  // ── LIVING ROOM FURNITURE ───────────────────────────────────
  b(4.5, 0.02, 3.5, M.rug, -1, 0.01, 0.8);
  b(3.4, 0.48, 1.0, M.sofa, -1.5, 0.24, 3.0);
  b(3.4, 0.9, 0.24, M.sofa, -1.5, 0.69, 3.38);
  b(0.24, 0.68, 1.0, M.sofa, -3.1, 0.48, 3.0);
  b(0.24, 0.68, 1.0, M.sofa, 0.1, 0.48, 3.0);
  b(0.95, 0.1, 0.85, M.sofaCush, -2.5, 0.5, 2.9);
  b(0.95, 0.1, 0.85, M.sofaCush, -1.5, 0.5, 2.9);
  b(0.95, 0.1, 0.85, M.sofaCush, -0.5, 0.5, 2.9);
  addCollider(-1.5, 3.0, 1.75, 0.60);

  b(3.0, 0.1, 1.8, M.tableTop, -2.5, 1.1, 0.8);
  b(0.1, 1.05, 0.1, M.tableLeg, -3.9, 0.525, 1.65);
  b(0.1, 1.05, 0.1, M.tableLeg, -1.1, 0.525, 1.65);
  b(0.1, 1.05, 0.1, M.tableLeg, -3.9, 0.525, -0.05);
  b(0.1, 1.05, 0.1, M.tableLeg, -1.1, 0.525, -0.05);
  addCollider(-3.9, 1.65, 0.15, 0.15);
  addCollider(-1.1, 1.65, 0.15, 0.15);
  addCollider(-3.9, -0.05, 0.15, 0.15);
  addCollider(-1.1, -0.05, 0.15, 0.15);
  addCollider(-2.5, 0.8, 1.5, 0.9, true);

  b(2.8, 0.5, 0.55, M.darkWood, 0, 0.25, -4.9);
  b(0.1, 0.9, 0.55, M.darkWood, -1.3, 0.7, -4.9);
  b(0.1, 0.9, 0.55, M.darkWood, 1.3, 0.7, -4.9);
  b(2.8, 0.06, 0.55, M.darkWood, 0, 1.14, -4.9);
  b(1.9, 1.05, 0.08, M.frame, 0, 1.65, -4.86);
  addCollider(0, -4.9, 1.45, 0.32);

  const shX = -4.76, shZ = -3.5;
  b(0.38, 2.3, 0.05, M.wood, shX, 1.15, shZ - 0.6);
  b(0.38, 2.3, 0.05, M.wood, shX, 1.15, shZ + 0.6);
  b(0.05, 2.3, 1.25, M.wood, -4.975, 1.15, shZ);
  const shelfY = [0.1, 0.8, 1.5, 2.2];
  shelfY.forEach((y, index) => {
    b(0.33, 0.05, 1.15, M.wood, shX - 0.025, y, shZ);
    if (index < 3) {
      b(0.28, 0.58, 0.12, M.book, shX - 0.025, y + 0.31, shZ + 0.2);
      b(0.28, 0.62, 0.12, M.book2, shX - 0.025, y + 0.33, shZ);
      b(0.28, 0.5, 0.12, M.book3, shX - 0.025, y + 0.27, shZ - 0.2);
      b(0.28, 0.55, 0.12, M.book, shX - 0.025, y + 0.3, shZ - 0.35);
    }
  });
  addCollider(shX, shZ, 0.22, 0.65);

  b(0.32, 0.42, 0.32, M.pot, -4.4, 0.21, 2.8);
  const plantM = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 8), M.plant);
  plantM.position.set(-4.4, 0.78, 2.8);
  plantM.castShadow = true;
  scene.add(plantM);

  // ── BEDROOM FURNITURE ───────────────────────────────────────
  b(3.5, 0.4, 4.5, M.wood, 2.5, 0.2, 12);
  b(3.3, 0.25, 4.3, M.bed, 2.5, 0.45, 12);
  b(3.4, 0.27, 2.6, M.blanket, 2.5, 0.46, 11.15);
  b(1.2, 0.15, 0.8, M.bed, 1.6, 0.6, 13.6);
  b(1.2, 0.15, 0.8, M.bed, 3.4, 0.6, 13.6);
  addCollider(2.5, 12, 1.75, 2.25);

  b(4.0, 0.02, 4.0, M.rug, 0, 0.01, 11);

  b(2.5, 2.5, 1.0, M.darkWood, -3.5, 1.25, 14.5);
  b(2.66, 0.08, 1.08, M.wood, -3.5, 2.54, 14.5);
  b(2.58, 0.12, 1.02, M.wood, -3.5, 0.06, 14.5);
  b(0.08, 2.42, 1.04, M.wood, -4.75, 1.25, 14.5);
  b(0.08, 2.42, 1.04, M.wood, -2.25, 1.25, 14.5);
  b(0.78, 2.22, 0.05, M.wardrobePanel, -4.08, 1.26, 13.98);
  b(0.78, 2.22, 0.05, M.wardrobePanel, -3.5, 1.26, 13.98);
  b(0.78, 2.22, 0.05, M.wardrobePanel, -2.92, 1.26, 13.98);
  b(0.04, 2.28, 0.06, M.wood, -3.79, 1.26, 13.99);
  b(0.04, 2.28, 0.06, M.wood, -3.21, 1.26, 13.99);
  b(0.04, 0.28, 0.03, M.handle, -3.82, 1.28, 13.94);
  b(0.04, 0.28, 0.03, M.handle, -3.18, 1.28, 13.94);
  b(0.18, 0.08, 0.18, M.wood, -4.45, 0.04, 14.12);
  b(0.18, 0.08, 0.18, M.wood, -2.55, 0.04, 14.12);
  b(0.18, 0.08, 0.18, M.wood, -4.45, 0.04, 14.88);
  b(0.18, 0.08, 0.18, M.wood, -2.55, 0.04, 14.88);
  addCollider(-3.5, 14.5, 1.25, 0.5);

  b(2.0, 0.1, 1.2, M.wood, -3.5, 1.0, 7.5);
  b(0.1, 1.0, 0.1, M.wood, -4.4, 0.5, 7.0);
  b(0.1, 1.0, 0.1, M.wood, -2.6, 0.5, 7.0);
  b(0.1, 1.0, 0.1, M.wood, -4.4, 0.5, 8.0);
  b(0.1, 1.0, 0.1, M.wood, -2.6, 0.5, 8.0);
  addCollider(-4.4, 7.0, 0.05, 0.05);
  addCollider(-2.6, 7.0, 0.05, 0.05);
  addCollider(-4.4, 8.0, 0.05, 0.05);
  addCollider(-2.6, 8.0, 0.05, 0.05);
  addCollider(-3.5, 7.5, 1.0, 0.6, true);

  // ── Safe zone visualisers ───────────────────────────────────
  const safeViz = safeZones.map(sz => {
    const geo = new THREE.CircleGeometry(sz.radius, 32);
    const mesh = new THREE.Mesh(geo, M.safe.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(sz.center.x, 0.015, sz.center.z);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });

  const safeZoneMeshes = safeZones.map((sz) => {
    const grp = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6), new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
    cone.position.y = -0.2;
    grp.add(cone);
    grp.position.set(sz.center.x, 2.4, sz.center.z);
    grp.visible = false;
    scene.add(grp);
    return grp;
  });

  // ── Debris pool init ────────────────────────────────────────
  const debrisMats = [M.plaster, M.concrete, M.debris];
  for (let i = 0; i < 60; i++) {
    const s = 0.07 + Math.random() * 0.25;
    const geo = Math.random() < 0.55 ? new THREE.BoxGeometry(s, s * 0.55, s * 0.85) : new THREE.DodecahedronGeometry(s * 0.6, 0);
    const mesh = new THREE.Mesh(geo, debrisMats[Math.floor(Math.random() * 3)]);
    mesh.castShadow = true;
    mesh.visible = false;
    mesh._vy = 0;
    mesh._fallen = false;
    scene.add(mesh);
    debrisPool.push(mesh);
  }

  // ── Controls ────────────────────────────────────────────────
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  let isLocked = false;
  const PITCH_MAX = Math.PI / 2.2;

  canvas.addEventListener("click", () => {
    if (gameState !== STATE.DONE) {
      canvas.requestPointerLock();
      // Browsers block audio until the user interacts (clicks the canvas)
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    }
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
    euler.x = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, euler.x));
    camera.quaternion.setFromEuler(euler);
  });

  const keys = {};
  document.addEventListener("keydown", e => {
    keys[e.code] = true;
    if (e.code === "KeyC") {
      if (isCrouching) {
        const p = camera.position;
        const underLivingTable = Math.sqrt(Math.pow(p.x - safeZones[0].center.x, 2) + Math.pow(p.z - safeZones[0].center.z, 2)) < safeZones[0].radius;
        const underBedroomDesk = Math.sqrt(Math.pow(p.x - safeZones[2].center.x, 2) + Math.pow(p.z - safeZones[2].center.z, 2)) < safeZones[2].radius;
        if (!underLivingTable && !underBedroomDesk) isCrouching = false;
      } else {
        isCrouching = true;
      }
    }
  });
  document.addEventListener("keyup", e => { keys[e.code] = false; });

  // ── Movement & Collision logic ──────────────────────────────
  const SPEED = 4.5;
  const P_RAD = 0.3;
  const fwd = new THREE.Vector3();
  const rgt = new THREE.Vector3();
  const mdir = new THREE.Vector3();

  function resolveColliders(px, pz) {
    for (const c of colliders) {
      if (c.crouchPassable && isCrouching) continue;
      const nearX = Math.max(c.minX, Math.min(c.maxX, px));
      const nearZ = Math.max(c.minZ, Math.min(c.maxZ, pz));
      const dx = px - nearX;
      const dz = pz - nearZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < P_RAD && dist > 0) {
        const push = (P_RAD - dist) / dist;
        px += dx * push;
        pz += dz * push;
      } else if (dist === 0) {
        const overX = P_RAD - Math.abs(px - (c.minX + c.maxX) * 0.5);
        const overZ = P_RAD - Math.abs(pz - (c.minZ + c.maxZ) * 0.5);
        if (overX < overZ) px += (px < (c.minX + c.maxX) * 0.5 ? -overX : overX);
        else pz += (pz < (c.minZ + c.maxZ) * 0.5 ? -overZ : overZ);
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
    if (keys["KeyW"] || keys["ArrowUp"]) mdir.add(fwd);
    if (keys["KeyS"] || keys["ArrowDown"]) mdir.sub(fwd);
    if (keys["KeyA"] || keys["ArrowLeft"]) mdir.sub(rgt);
    if (keys["KeyD"] || keys["ArrowRight"]) mdir.add(rgt);

    if (mdir.lengthSq() > 0) {
      mdir.normalize().multiplyScalar(spd);
      let nx = camera.position.x + mdir.x;
      let nz = camera.position.z;
      const rx = resolveColliders(nx, nz);
      nx = rx.px; nz = rx.pz;

      nz += mdir.z;
      const rz = resolveColliders(nx, nz);
      nx = rz.px; nz = rz.pz;

      camera.position.x = Math.max(-4.7, Math.min(4.7, nx));
      camera.position.z = Math.max(-4.7, Math.min(14.7, nz));
    }
    camera.position.y = currentEyeY;
  }

  function checkSafeZone() {
    const p = camera.position;
    return safeZones.some((sz, i) => {
      const dx = p.x - sz.center.x;
      const dz = p.z - sz.center.z;
      const inArea = Math.sqrt(dx * dx + dz * dz) < sz.radius;
      if (!inArea) return false;
      if (i === 0 || i === 2) return isCrouching;
      return true;
    });
  }

  // ── Game loops ───────────────────────────────────────────────
  function spawnDebris() {
    const chunk = debrisPool.find(d => !d.visible && d._fallen === false);
    if (!chunk) return;

    const rx = (Math.random() - 0.5) * 8.8;
    const rz = -4.4 + Math.random() * 18.8;

    chunk.position.set(rx, RH - 0.05, rz);
    chunk._vy = 0;
    chunk._fallen = false;
    chunk.visible = true;
    chunk.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    activeDebris.push(chunk);
  }

  function updateDebris(dt) {
    for (let i = activeDebris.length - 1; i >= 0; i--) {
      const d = activeDebris[i];
      if (d._fallen) continue;

      d._vy -= 9.8 * dt;
      d.position.y += d._vy * dt;
      d.rotation.x += 1.5 * dt;
      d.rotation.z += 1.0 * dt;

      if (!isHiding) {
        const dx = d.position.x - camera.position.x;
        const dz = d.position.z - camera.position.z;
        if (Math.sqrt(dx * dx + dz * dz) < 0.65 && d.position.y < 2.2 && d.position.y > 0.5) {
          health = Math.max(0, health - 14);
          panic = Math.min(100, panic + 10);
          d._fallen = true;
          d.position.y = 0.1;
          flashScreen("rgba(220,30,30,0.4)", 350);
          
          if (sounds.crash.isPlaying) sounds.crash.stop();
          sounds.crash.play();
        }
      }

      if (d.position.y <= 0.1) {
        d.position.y = 0.1;
        d._fallen = true;
        
        // Floor hit crash
        if (!sounds.crash.isPlaying) {
          sounds.crash.play();
        }
      }
    }
  }

  function flashScreen(color, duration) {
    const wrapper = canvas.parentElement;
    const fl = document.createElement("div");
    fl.style.cssText = `position:absolute;inset:0;background:${color};pointer-events:none;z-index:60;transition:opacity ${duration}ms ease;`;
    wrapper.appendChild(fl);
    requestAnimationFrame(() => { fl.style.opacity = "0"; });
    setTimeout(() => fl.remove(), duration + 50);
  }

  // ── HUD Elements ─────────────────────────────────────────────
  let panicFill, healthFill, timerEl, statusEl, safeEl, outcomeEl;

  function buildHUD() {
    const wrapper = canvas.parentElement;
    if (getComputedStyle(wrapper).position === "static") wrapper.style.position = "relative";

    const hint = document.createElement("div"); hint.id = "game-hint";
    hint.innerHTML = `<div class="gh-title">🏢 EARTHQUAKE SCENARIO</div><div class="gh-sub">Click anywhere to enter</div><div class="gh-keys"><span>WASD</span> Move &nbsp;·&nbsp;<span>Mouse</span> Look &nbsp;·&nbsp;<span>C</span> Crouch &nbsp;·&nbsp;<span>Esc</span> Exit</div><div class="gh-warn">⚠ An earthquake will strike in 30 seconds. Find cover.</div>`;
    wrapper.appendChild(hint);

    const cross = document.createElement("div"); cross.id = "game-crosshair";
    cross.innerHTML = `<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="8" stroke="rgba(255,255,255,.75)" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="16" x2="12" y2="22" stroke="rgba(255,255,255,.75)" stroke-width="1.5" stroke-linecap="round"/><line x1="2" y1="12" x2="8" y2="12" stroke="rgba(255,255,255,.75)" stroke-width="1.5" stroke-linecap="round"/><line x1="16" y1="12" x2="22" y2="12" stroke="rgba(255,255,255,.75)" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="1.2" fill="rgba(255,255,255,.6)"/></svg>`;
    cross.style.display = "none";
    wrapper.appendChild(cross);

    document.addEventListener("pointerlockchange", () => { cross.style.display = document.pointerLockElement === canvas ? "block" : "none"; });

    const pw = document.createElement("div"); pw.id = "panic-wrap";
    pw.innerHTML = `<div id="panic-label">PANIC</div><div id="panic-bar"><div id="panic-fill"></div></div>`;
    wrapper.appendChild(pw);
    panicFill = document.getElementById("panic-fill");

    const hw = document.createElement("div"); hw.id = "health-wrap";
    hw.innerHTML = `<div id="health-label">HEALTH</div><div id="health-bar"><div id="health-fill"></div></div>`;
    wrapper.appendChild(hw);
    healthFill = document.getElementById("health-fill");

    timerEl = document.createElement("div"); timerEl.id = "game-timer"; wrapper.appendChild(timerEl);
    statusEl = document.createElement("div"); statusEl.id = "game-status"; statusEl.textContent = "Explore your apartment. Something feels off..."; wrapper.appendChild(statusEl);
    safeEl = document.createElement("div"); safeEl.id = "safe-label"; safeEl.textContent = "✓ SAFE — STAY HERE"; safeEl.style.display = "none"; wrapper.appendChild(safeEl);
    const crouchEl = document.createElement("div"); crouchEl.id = "crouch-indicator"; crouchEl.textContent = "▼ CROUCHING"; crouchEl.style.display = "none"; wrapper.appendChild(crouchEl);
    outcomeEl = document.createElement("div"); outcomeEl.id = "outcome-screen"; outcomeEl.style.display = "none"; wrapper.appendChild(outcomeEl);
  }

  function updateHUD() {
    if (!panicFill) return;

    const p = panic / 100;
    panicFill.style.width = panic + "%";
    panicFill.style.background = `rgb(${Math.round(p * 210)},${Math.round((1 - p) * 170 + 20)},20)`;

    const h = health / 100;
    healthFill.style.width = health + "%";
    healthFill.style.background = `rgb(${Math.round((1 - h) * 210)},${Math.round(h * 170 + 20)},20)`;

    safeEl.style.display = (gameState === STATE.QUAKE && isHiding) ? "block" : "none";

    const crouchEl = document.getElementById("crouch-indicator");
    if (crouchEl) crouchEl.style.display = isCrouching ? "block" : "none";

    // Play heartbeat audio if panic goes over 70%
    if (panic > 70 && sounds.heartbeat.buffer && !sounds.heartbeat.isPlaying) {
      sounds.heartbeat.play();
    } else if (panic <= 70 && sounds.heartbeat.isPlaying) {
      sounds.heartbeat.stop();
    }
    // Fade the heartbeat volume based on how far past 70% panic is
    if (sounds.heartbeat.isPlaying) {
      sounds.heartbeat.setVolume((panic - 70) / 30);
    }

    if (gameState === STATE.CALM) {
      const rem = Math.ceil(CALM_DURATION - calmTimer);
      timerEl.textContent = "";
      statusEl.textContent =
        rem > 15
          ? "Explore your apartment. Something feels off..."
          : "⚠ The floor is trembling... brace yourself.";
      statusEl.style.color = rem > 15 ? "#d1c9bb" : "#fbbf24";
    }

    if (gameState === STATE.QUAKE) {
      timerEl.textContent = `QUAKE: ${Math.ceil(QUAKE_DURATION - quakeTimer)}s`;
      const p = camera.position;

      const nearTable = Math.sqrt(Math.pow(p.x - safeZones[0].center.x, 2) + Math.pow(p.z - safeZones[0].center.z, 2)) < safeZones[0].radius;
      const nearDesk = Math.sqrt(Math.pow(p.x - safeZones[2].center.x, 2) + Math.pow(p.z - safeZones[2].center.z, 2)) < safeZones[2].radius;

      if (isHiding) {
        statusEl.textContent = "✓ Stay hidden! Wait for it to pass...";
        statusEl.style.color = "#4ade80";
      } else if ((nearTable || nearDesk) && !isCrouching) {
        statusEl.textContent = "⬇ CROUCH [C] to get underneath!";
        statusEl.style.color = "#fbbf24";
      } else {
        statusEl.textContent = "⚠ GET UNDER A DESK / TABLE OR IN THE DOORFRAME!";
        statusEl.style.color = "#f87171";
      }
    }
  }

  function showOutcome() {
    gameState = STATE.DONE;
    document.exitPointerLock();

    // Kill audio at the end screen
    if(sounds.rumble.isPlaying) sounds.rumble.stop();
    if(sounds.heartbeat.isPlaying) sounds.heartbeat.stop();

    const hint = document.getElementById("game-hint");
    if (hint) hint.style.display = "none";

    let title, body, panicResult, accent;

    if (health <= 0) {
      title = "YOU DIDN'T SURVIVE";
      body = "Panic overwhelmed you. Falling debris struck before you found cover. Knowing where to shelter beforehand could have saved your life.";
      panicResult = "Panic: CRITICAL — 100%";
      accent = "#ef4444";
    } else if (panic >= 75) {
      title = "SURVIVED — HIGH PANIC";
      body = "You made it out, but barely. Hesitating in the open cost you health and let panic spiral. Next time: table or doorframe, immediately.";
      panicResult = `Panic: HIGH — ${Math.round(panic)}%`;
      accent = "#f97316";
    } else if (panic >= 40) {
      title = "SURVIVED";
      body = "Good instincts. You found cover and rode it out. A little quicker next time and your panic could stay much lower.";
      panicResult = `Panic: MODERATE — ${Math.round(panic)}%`;
      accent = "#facc15";
    } else {
      title = "SURVIVED — CALM & SAFE";
      body = "Excellent. You reacted immediately, sheltered correctly, and stayed composed throughout. The Survival Encyclopedia's method works.";
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
          <div class="outcome-stat">Health remaining: <strong>${Math.max(0, Math.round(health))}%</strong></div>
        </div>
        <button class="outcome-btn" onclick="location.reload()">↩ Try Again</button>
      </div>
    `;
  }

  buildHUD();

  window.addEventListener("resize", () => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  });

  let lastTime = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);

    if (gameState === STATE.DONE) {
      renderer.render(scene, camera);
      return;
    }

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const t = now * 0.001;

    updateMovement(dt);

    if (gameState === STATE.CALM) {
      calmTimer += dt;
      panic += (48 - panic) * 0.5 * dt;

      if (calmTimer > CALM_DURATION - 8) {
        const strength = (calmTimer - (CALM_DURATION - 8)) / 8;
        camera.position.x += (Math.random() - 0.5) * 0.004 * strength;
        camera.position.z += (Math.random() - 0.5) * 0.004 * strength;
      }

      if (calmTimer >= CALM_DURATION) {
        gameState = STATE.QUAKE;
        safeViz.forEach(v => v.visible = true);
        safeZoneMeshes.forEach(v => v.visible = true);
        flashScreen("rgba(255,200,40,0.55)", 500);

        if (sounds.rumble.buffer && !sounds.rumble.isPlaying) {
          sounds.rumble.play();
        }
      }
    }

    if (gameState === STATE.QUAKE) {
      quakeTimer += dt;
      const progress = quakeTimer / QUAKE_DURATION;
      const ramp = Math.min(1, quakeTimer / 3);
      const ease = progress > 0.8 ? 1 - (progress - 0.8) / 0.2 : 1;
      shakeIntensity = 0.14 * ramp * ease;

      // Fade up earthquake audio with intensity
      if (sounds.rumble.isPlaying) {
        sounds.rumble.setVolume(ramp * ease * 1.8);
      }

      cameraBase.copy(camera.position);
      camera.position.x += (Math.random() - 0.5) * shakeIntensity * 2.2;
      camera.position.y = currentEyeY + (Math.random() - 0.5) * shakeIntensity * 0.8;
      camera.position.z += (Math.random() - 0.5) * shakeIntensity * 2.2;
      camera.rotation.z = (Math.random() - 0.5) * shakeIntensity * 0.6;

      isHiding = checkSafeZone();

      if (isHiding) {
        panic = Math.max(0, panic - 20 * dt);
      } else {
        panic = Math.min(100, panic + 25 * dt);
        health = Math.max(0, health - 5 * dt);

        if (Math.random() < 0.08) {
          flashScreen("rgba(220,30,30,0.15)", 100);
        }
      }

      debrisCooldown -= dt;
      if (debrisCooldown <= 0) {
        const rate = Math.max(0.12, 0.5 - quakeTimer * 0.015);
        debrisCooldown = rate;
        spawnDebris();
        if (quakeTimer > 5) spawnDebris();
        if (quakeTimer > 15) spawnDebris();
      }

      updateDebris(dt);

      const flicker1 =
        1.35 +
        Math.sin(t * 24) * 0.22 * ramp +
        Math.sin(t * 57) * 0.10 * ramp -
        (Math.random() < 0.06 * ramp ? 0.55 : 0);

      const flicker2 =
        1.2 +
        Math.sin(t * 20 + 0.7) * 0.18 * ramp +
        Math.sin(t * 43 + 1.2) * 0.08 * ramp -
        (Math.random() < 0.04 * ramp ? 0.45 : 0);

      ceilLight1.intensity = Math.max(0.28, flicker1);
      ceilLight3.intensity = Math.max(0.24, flicker2);

      const bulb1Dim = Math.random() < 0.10 * ramp;
      const bulb2Dim = Math.random() < 0.08 * ramp;

      bulb1Mat.color.setHex(bulb1Dim ? 0x776f60 : 0xffffee);
      bulb2Mat.color.setHex(bulb2Dim ? 0x776f60 : 0xffffee);

      safeViz.forEach(v => {
        v.material.opacity = isHiding ? 0.35 : 0.18 + Math.sin(t * 3) * 0.08;
      });

      safeZoneMeshes.forEach(v => {
        v.position.y = 2.4 + Math.sin(t * 2) * 0.15;
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