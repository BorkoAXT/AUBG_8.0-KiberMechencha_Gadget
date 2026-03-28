// ============================================================
//  fire.js  –  Survival Encyclopedia  |  Scenario 2: House Fire
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
  renderer.toneMappingExposure = 0.85;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1008);
  scene.fog = new THREE.Fog(0x1a1008, 18, 40);

  const camera = new THREE.PerspectiveCamera(72, canvas.clientWidth / canvas.clientHeight, 0.05, 100);
  camera.rotation.order = "YXZ";
  camera.position.set(5.0, 1.7, 14.0); // Start in guest bedroom

  // ── Procedural Audio Engine ─────────────────────────────────
  const listener = new THREE.AudioListener();
  camera.add(listener);

  const sounds = {
    fire: new THREE.Audio(listener),
    cough: new THREE.Audio(listener),
    heartbeat: new THREE.Audio(listener),
    glass: new THREE.Audio(listener),
    sizzle: new THREE.Audio(listener),
  };

  const audioCtx = THREE.AudioContext.getContext();

  function createFireBuffer() {
    const len = audioCtx.sampleRate * 3;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.04 * white) / 1.04;
      const crackle = Math.random() < 0.002 ? (Math.random() - 0.5) * 2 : 0;
      data[i] = (lastOut * 2.5 + crackle) * 0.8;
    }
    return buf;
  }

  function createCoughBuffer() {
    const len = audioCtx.sampleRate * 0.5;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / audioCtx.sampleRate;
      const burst1 = t < 0.08 ? Math.sin(t * 180) * Math.exp(-t * 30) : 0;
      const burst2 = (t > 0.15 && t < 0.25) ? Math.sin((t - 0.15) * 200) * Math.exp(-(t - 0.15) * 25) : 0;
      const noise = (Math.random() - 0.5) * 0.3 * (burst1 !== 0 || burst2 !== 0 ? 1 : 0);
      data[i] = (burst1 + burst2 + noise) * 1.2;
    }
    return buf;
  }

  function createHeartbeatBuffer() {
    const len = audioCtx.sampleRate * 1.0;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / audioCtx.sampleRate;
      const env1 = Math.exp(-t * 15);
      const env2 = t > 0.25 ? Math.exp(-(t - 0.25) * 15) : 0;
      data[i] = Math.sin(t * 40 * Math.PI * 2) * (env1 + env2) * 1.5;
    }
    return buf;
  }

  function createGlassBuffer() {
    const len = audioCtx.sampleRate * 0.4;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / audioCtx.sampleRate;
      const shatter = Math.random() * 2 - 1;
      const ring = Math.sin(t * 3200) * 0.3 + Math.sin(t * 5400) * 0.2;
      const env = Math.exp(-t * 12);
      data[i] = (shatter * 0.7 + ring) * env * 1.5;
    }
    return buf;
  }

  function createSizzleBuffer() {
    const len = audioCtx.sampleRate * 0.3;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / audioCtx.sampleRate;
      data[i] = (Math.random() - 0.5) * Math.exp(-t * 8) * 2;
    }
    return buf;
  }

  sounds.fire.setBuffer(createFireBuffer());
  sounds.fire.setLoop(true);
  sounds.fire.setVolume(0);

  sounds.cough.setBuffer(createCoughBuffer());
  sounds.cough.setVolume(0.7);

  sounds.heartbeat.setBuffer(createHeartbeatBuffer());
  sounds.heartbeat.setLoop(true);
  sounds.heartbeat.setVolume(0);

  sounds.glass.setBuffer(createGlassBuffer());
  sounds.glass.setVolume(0.9);

  sounds.sizzle.setBuffer(createSizzleBuffer());
  sounds.sizzle.setVolume(0.6);

  // ── Game state ──────────────────────────────────────────────
  const STATE = { CALM: 0, FIRE: 1, DONE: 2 };
  let gameState = STATE.CALM;
  let calmTimer = 0;
  let fireTimer = 0;
  const CALM_DURATION = 5;
  const FIRE_DURATION = 90;

  let panic = 30;
  let health = 100;
  let stamina = 100;
  let oxygen = 100; // suffocation meter
  let isSprinting = false;

  // ── Crouch ──────────────────────────────────────────────────
  const EYE_STAND = 1.7;
  const EYE_CROUCH = 0.75;
  let isCrouching = false;
  let currentEyeY = EYE_STAND;

  // ── Face covering mechanic ──────────────────────────────────
  let hasCloth = false;
  let clothIsWet = false;
  let nearCloth = false;
  let nearSink = false;
  let clothPickedUpMsg = false;

  const clothPos = new THREE.Vector3(2.8, 1.05, -12.5); // towel in bathroom
  const sinkPos = new THREE.Vector3(3.8, 0.9, -13.0);   // bathroom sink

  // ── Door mechanic ──────────────────────────────────────────
  // Doors: each has position, normal, isHot, isOpen, mesh ref
  const doors = [];

  // ── Window escape mechanic ─────────────────────────────────
  const windows = [];
  let escaped = false;

  // ── Fire spreading ─────────────────────────────────────────
  const fireSpots = [];    // {pos, radius, startTime, maxRadius, growRate}
  const fireLights = [];
  const fireParticles = [];

  // ── Smoke / visibility ─────────────────────────────────────
  let smokeLevel = 0;       // 0-1, affects fog distance and overlay opacity
  let coughCooldown = 0;

  // ── Room layout ─────────────────────────────────────────────
  // House: ~16m x 16m
  // Living room:    (-5 to 5) x (-5 to 5)     center (0,0)
  // Hallway:        (-1.5 to 1.5) x (5 to 11)  center (0,8)
  // Kitchen:        (-7 to -1.5) x (5 to 11)   center (-4.25, 8)
  // Bedroom:        (1.5 to 7) x (5 to 11)     center (4.25, 8)
  // Bathroom:       (1.5 to 5) x (-11 to -5)   center (3.25, -8) — behind living room

  const RH = 3; // room height

  // ── Materials ───────────────────────────────────────────────
  const M = {
    wall:     new THREE.MeshStandardMaterial({ color: 0xd4c9b8, roughness: 0.95, metalness: 0.0 }),
    floor:    new THREE.MeshStandardMaterial({ color: 0x7a6347, roughness: 0.92, metalness: 0.0 }),
    ceiling:  new THREE.MeshStandardMaterial({ color: 0xc8bfb0, roughness: 0.95, metalness: 0.0 }),
    wood:     new THREE.MeshStandardMaterial({ color: 0x6b4c2a, roughness: 0.88, metalness: 0.0 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x3d2b14, roughness: 0.9, metalness: 0.0 }),
    tile:     new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.7, metalness: 0.0 }),
    kitchenTile: new THREE.MeshStandardMaterial({ color: 0xc0c8c0, roughness: 0.65, metalness: 0.0 }),
    sofa:     new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.95, metalness: 0.0 }),
    sofaCush: new THREE.MeshStandardMaterial({ color: 0x5a6578, roughness: 0.98, metalness: 0.0 }),
    tableTop: new THREE.MeshStandardMaterial({ color: 0x5a3e22, roughness: 0.88, metalness: 0.0 }),
    tableLeg: new THREE.MeshStandardMaterial({ color: 0x7c5c3a, roughness: 0.85, metalness: 0.0 }),
    window:   new THREE.MeshLambertMaterial({ color: 0x8ab4e8, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
    windowFr: new THREE.MeshLambertMaterial({ color: 0xd4c9b8 }),
    door:     new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.85 }),
    doorFr:   new THREE.MeshLambertMaterial({ color: 0xc8bfb0 }),
    rug:      new THREE.MeshLambertMaterial({ color: 0x8b2020 }),
    counter:  new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.1 }),
    stove:    new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.3 }),
    bed:      new THREE.MeshLambertMaterial({ color: 0xeeeeee }),
    blanket:  new THREE.MeshLambertMaterial({ color: 0x3b5998 }),
    towel:    new THREE.MeshLambertMaterial({ color: 0xff6600 }),
    towelWet: new THREE.MeshLambertMaterial({ color: 0xa0a8a0 }),
    sink:     new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3, metalness: 0.5 }),
    mirror:   new THREE.MeshStandardMaterial({ color: 0xaabbcc, roughness: 0.1, metalness: 0.8 }),
    handle:   new THREE.MeshStandardMaterial({ color: 0x8c8c8c, roughness: 0.45, metalness: 0.9 }),
    fridge:   new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.4, metalness: 0.2 }),
    frame:    new THREE.MeshLambertMaterial({ color: 0x222222 }),
    plant:    new THREE.MeshLambertMaterial({ color: 0x2d5a1b }),
    pot:      new THREE.MeshLambertMaterial({ color: 0x8b4513 }),
    fireMat:  new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8 }),
    exitSign: new THREE.MeshBasicMaterial({ color: 0x00ff44 }),
  };

  // ── Lights ──────────────────────────────────────────────────
  const ambientLight = new THREE.AmbientLight(0xffedd1, 0.15);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xfff4dc, 0x2c241d, 0.35);
  scene.add(hemiLight);

  // Living room light
  const livingLight = new THREE.PointLight(0xffe8b8, 1.4, 16);
  livingLight.position.set(0, 2.55, 0);
  livingLight.castShadow = true;
  livingLight.shadow.mapSize.set(1024, 1024);
  livingLight.shadow.bias = -0.0015;
  livingLight.shadow.radius = 4;
  scene.add(livingLight);

  // Hallway light
  const hallLight = new THREE.PointLight(0xffe8b8, 0.8, 10);
  hallLight.position.set(0, 2.55, 8);
  hallLight.castShadow = true;
  hallLight.shadow.mapSize.set(512, 512);
  scene.add(hallLight);

  // Kitchen light
  const kitchenLight = new THREE.PointLight(0xfff0d0, 1.2, 12);
  kitchenLight.position.set(-4.25, 2.55, 8);
  kitchenLight.castShadow = true;
  kitchenLight.shadow.mapSize.set(512, 512);
  scene.add(kitchenLight);

  // Bedroom light
  const bedroomLight = new THREE.PointLight(0xffd7a3, 1.0, 10);
  bedroomLight.position.set(4.25, 2.55, 8);
  scene.add(bedroomLight);

  // Bathroom light
  const bathroomLight = new THREE.PointLight(0xf0f0ff, 0.9, 8);
  bathroomLight.position.set(3.25, 2.55, -8);
  scene.add(bathroomLight);

  // Light bulb meshes
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffee });
  function addBulb(x, z) {
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.25, 0.16), M.frame);
    stem.position.set(x, RH - 0.12, z);
    scene.add(stem);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), bulbMat.clone());
    bulb.position.set(x, 2.7, z);
    scene.add(bulb);
    return bulb;
  }
  const bulbs = [addBulb(0, 0), addBulb(0, 8), addBulb(-4.25, 8), addBulb(4.25, 8), addBulb(3.25, -8)];

  // ── Colliders ───────────────────────────────────────────────
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

  // ==============================================================
  //  LIVING ROOM  (-5..5, -5..5)
  // ==============================================================
  b(10, 0.12, 10, M.floor, 0, -0.06, 0);
  b(10, 0.12, 10, M.ceiling, 0, RH + 0.06, 0);

  // South wall (front, has front door offset right)
  b(3.5, RH, 0.12, M.wall, -3.25, RH/2, -5);   // far left  (x: -5 → -1.5)
  b(3.5, RH, 0.12, M.wall,  3.25, RH/2, -5);   // far right (x:  1.5 → 5)
  b(1.8, RH, 0.12, M.wall, -0.6,  RH/2, -5);   // left fill (x: -1.5 → 0.3)
  b(0.2, RH, 0.12, M.wall,  1.4,  RH/2, -5);   // right fill (x: 1.3 → 1.5)
  b(1.0, 0.89, 0.12, M.wall, 0.8, 2.555, -5);   // above door
  addCollider(-3.25, -5, 1.75, 0.15);
  addCollider( 3.25, -5, 1.75, 0.15);
  addCollider(-0.6,  -5, 0.9,  0.15); // left fill
  addCollider( 1.4,  -5, 0.1,  0.15); // right fill

  // Front door — 1.0m wide, shifted right, centered at x=0.8
  const frontDoorMesh = b(1.0, 2.1, 0.06, M.door, 0.8, 1.06, -5);
  const fdPanelMat = new THREE.MeshStandardMaterial({ color: 0x7a5c10, roughness: 0.82 });
  const frontDoorParts = [
    b(0.78, 0.82, 0.03, fdPanelMat, 0.8, 1.62, -4.985),
    b(0.78, 0.72, 0.03, fdPanelMat, 0.8, 0.52, -4.985),
    b(0.04, 0.14, 0.04, M.handle, 0.36, 1.06, -4.97),
    b(0.04, 0.04, 0.06, M.handle, 0.36, 1.02, -4.97),
    b(0.04, 0.1, 0.06, M.handle, 1.28, 0.4,  -4.97),
    b(0.04, 0.1, 0.06, M.handle, 1.28, 1.06, -4.97),
    b(0.04, 0.1, 0.06, M.handle, 1.28, 1.72, -4.97),
    b(0.88, 0.18, 0.04, M.handle, 0.8, 0.09, -4.985),
  ];
  // Door frame (stays visible even when open)
  b(0.1, 2.18, 0.15, M.doorFr, 0.28, 1.09, -5);
  b(0.1, 2.18, 0.15, M.doorFr, 1.32, 1.09, -5);
  b(1.16, 0.14, 0.15, M.doorFr, 0.8, 2.21, -5);

  // West wall
  b(0.12, RH, 10, M.wall, -5, RH/2, 0);
  addCollider(-5, 0, 0.15, 5);

  // East wall (solid — no window)
  b(0.12, RH, 10, M.wall, 5, RH/2, 0);
  addCollider(5, 0, 0.15, 5);

  // North wall of living room (connects to hallway)
  b(3.5, RH, 0.12, M.wall, -3.25, RH/2, 5); // left of hallway opening
  b(3.5, RH, 0.12, M.wall, 3.25, RH/2, 5);  // right of hallway opening
  addCollider(-3.25, 5, 1.75, 0.15);
  addCollider(3.25, 5, 1.75, 0.15);
  // Opening: from x=-1.5 to x=1.5 (3m wide hallway entrance - always open)

  // Living room furniture
  b(4.5, 0.02, 3.5, M.rug, -0.5, 0.01, 0);

  // Sofa — seat, back, armrests, 3 cushions
  b(3.4, 0.48, 1.0, M.sofa, -1.5, 0.24, 3.2);
  b(3.4, 0.9, 0.24, M.sofa, -1.5, 0.69, 3.68);
  b(0.24, 0.68, 1.0, M.sofa, -3.1, 0.48, 3.2);
  b(0.24, 0.68, 1.0, M.sofa, 0.1, 0.48, 3.2);
  b(1.0, 0.2, 0.85, M.sofaCush, -2.45, 0.54, 3.15);
  b(1.0, 0.2, 0.85, M.sofaCush, -1.5,  0.54, 3.15);
  b(1.0, 0.2, 0.85, M.sofaCush, -0.55, 0.54, 3.15);
  // Sofa legs
  b(0.08, 0.12, 0.08, M.darkWood, -2.95, 0.06, 2.75);
  b(0.08, 0.12, 0.08, M.darkWood, -0.05, 0.06, 2.75);
  b(0.08, 0.12, 0.08, M.darkWood, -2.95, 0.06, 3.65);
  b(0.08, 0.12, 0.08, M.darkWood, -0.05, 0.06, 3.65);
  addCollider(-1.5, 3.2, 1.75, 0.6);

  // Coffee table — tabletop, shelf, legs
  b(2.2, 0.06, 1.2, M.tableTop, -1.5, 0.45, 1.2);
  b(2.0, 0.04, 1.0, M.wood, -1.5, 0.18, 1.2);   // lower shelf
  b(0.06, 0.42, 0.06, M.tableLeg, -2.5, 0.22, 1.7);
  b(0.06, 0.42, 0.06, M.tableLeg, -0.5, 0.22, 1.7);
  b(0.06, 0.42, 0.06, M.tableLeg, -2.5, 0.22, 0.7);
  b(0.06, 0.42, 0.06, M.tableLeg, -0.5, 0.22, 0.7);
  // Decorative tray on table
  b(0.9, 0.04, 0.55, M.darkWood, -1.5, 0.49, 1.2);
  addCollider(-1.5, 1.2, 1.1, 0.6, true);

  // TV stand — cabinet body, drawer strips, screen bezel + screen
  b(2.8, 0.5, 0.55, M.darkWood, -1.5, 0.25, -4.0);
  b(2.6, 0.03, 0.45, M.tableLeg, -1.5, 0.52, -4.0); // surface trim
  // Drawer lines on front face
  b(1.25, 0.03, 0.04, M.handle, -2.05, 0.35, -3.74);
  b(1.25, 0.03, 0.04, M.handle, -0.95, 0.35, -3.74);
  b(0.06, 0.2, 0.04, M.handle, -1.5, 0.35, -3.74);
  // TV — bezel frame, black screen, power LED
  b(2.1, 1.22, 0.1, M.frame, -1.5, 1.1, -4.3);
  b(1.92, 1.06, 0.06, new THREE.MeshBasicMaterial({ color: 0x050a12 }), -1.5, 1.1, -4.28);
  b(0.05, 0.05, 0.04, new THREE.MeshBasicMaterial({ color: 0x00ff44 }), -2.44, 0.56, -4.27);
  addCollider(-1.5, -4.0, 1.4, 0.3);

  // Bookshelf — back panel, 4 shelves, vertical divider, books
  b(0.06, 2.2, 0.8, M.darkWood, 4.33, 1.1, -3.5); // back panel
  b(0.4, 0.05, 0.8, M.wood, 4.0, 0.0,  -3.5);     // bottom
  b(0.4, 0.05, 0.8, M.wood, 4.0, 0.72, -3.5);
  b(0.4, 0.05, 0.8, M.wood, 4.0, 1.44, -3.5);
  b(0.4, 0.05, 0.8, M.wood, 4.0, 2.16, -3.5);     // top
  // Books (colourful spines on shelf)
  b(0.06, 0.55, 0.18, new THREE.MeshLambertMaterial({ color: 0xcc2222 }), 3.78, 0.39, -3.8);
  b(0.06, 0.6,  0.14, new THREE.MeshLambertMaterial({ color: 0x2244cc }), 3.78, 0.41, -3.58);
  b(0.06, 0.5,  0.16, new THREE.MeshLambertMaterial({ color: 0x228844 }), 3.78, 0.37, -3.38);
  b(0.06, 0.58, 0.15, new THREE.MeshLambertMaterial({ color: 0xcc8822 }), 3.78, 1.12, -3.72);
  b(0.06, 0.52, 0.17, new THREE.MeshLambertMaterial({ color: 0x882266 }), 3.78, 1.09, -3.5);
  addCollider(4.0, -3.5, 0.25, 0.45);

  // Plant — terracotta pot with soil + sphere foliage
  b(0.32, 0.28, 0.32, M.pot, -4.4, 0.14, -3.5);
  b(0.28, 0.06, 0.28, new THREE.MeshLambertMaterial({ color: 0x3d2b14 }), -4.4, 0.29, -3.5); // soil
  const plantMesh = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 10), M.plant);
  plantMesh.position.set(-4.4, 0.82, -3.5);
  plantMesh.castShadow = true;
  scene.add(plantMesh);
  // Second smaller sphere for volume
  const plantMesh2 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), M.plant);
  plantMesh2.position.set(-4.15, 1.05, -3.35);
  plantMesh2.castShadow = true;
  scene.add(plantMesh2);

  // ==============================================================
  //  HALLWAY  (-1.5..1.5, 5..11)
  // ==============================================================
  b(3, 0.12, 6, M.floor, 0, -0.06, 8);
  b(3, 0.12, 6, M.ceiling, 0, RH + 0.06, 8);

  // Hallway west wall (with door to kitchen)
  b(0.12, RH, 2.1, M.wall, -1.5, RH/2, 6.05);
  b(0.12, RH, 2.1, M.wall, -1.5, RH/2, 9.95);
  b(0.12, 0.645, 3, M.wall, -1.5, 2.6775, 8);
  addCollider(-1.5, 6.05, 0.15, 1.05);
  addCollider(-1.5, 9.95, 0.15, 1.05);

  // Kitchen door opening (hallway west, z=7..9)
  const kitchenDoorMesh = b(0.08, 2.35, 1.8, M.door, -1.55, 1.18, 8);
  const intPanelMat = new THREE.MeshStandardMaterial({ color: 0x7a5c10, roughness: 0.82 });
  const kitchenDoorParts = [
    b(0.03, 0.88, 1.38, intPanelMat, -1.568, 1.72, 8),
    b(0.03, 0.80, 1.38, intPanelMat, -1.568, 0.65, 8),
    b(0.07, 0.04, 0.04, M.handle, -1.515, 1.18, 7.25),
    b(0.06, 0.12, 0.04, M.handle, -1.57, 0.38, 8.78),
    b(0.06, 0.12, 0.04, M.handle, -1.57, 1.18, 8.78),
    b(0.06, 0.12, 0.04, M.handle, -1.57, 1.98, 8.78),
  ];
  doors.push({
    pos: new THREE.Vector3(-1.5, 1.18, 8),
    mesh: kitchenDoorMesh,
    parts: kitchenDoorParts,
    isHot: false,
    isOpen: false,
    openAngle: 0,
    axis: 'z',
    interactRadius: 1.6,
    leadsTo: 'kitchen',
    colliderIndex: -1,
  });
  const kitchenDoorColliderIdx = colliders.length;
  addCollider(-1.5, 8, 0.15, 0.6);
  doors[doors.length - 1].colliderIndex = kitchenDoorColliderIdx;

  // Hallway east wall (with door to bedroom)
  b(0.12, RH, 2.1, M.wall, 1.5, RH/2, 6.05);
  b(0.12, RH, 2.1, M.wall, 1.5, RH/2, 9.95);
  b(0.12, 0.645, 3, M.wall, 1.5, 2.6775, 8);
  addCollider(1.5, 6.05, 0.15, 1.05);
  addCollider(1.5, 9.95, 0.15, 1.05);

  // Bedroom door (hallway east, z=7..9)
  const bedroomDoorMesh = b(0.08, 2.35, 1.8, M.door, 1.55, 1.18, 8);
  const bedroomDoorParts = [
    b(0.03, 0.88, 1.38, intPanelMat, 1.568, 1.72, 8),
    b(0.03, 0.80, 1.38, intPanelMat, 1.568, 0.65, 8),
    b(0.07, 0.04, 0.04, M.handle, 1.515, 1.18, 8.75),
    b(0.06, 0.12, 0.04, M.handle, 1.57, 0.38, 7.22),
    b(0.06, 0.12, 0.04, M.handle, 1.57, 1.18, 7.22),
    b(0.06, 0.12, 0.04, M.handle, 1.57, 1.98, 7.22),
  ];
  doors.push({
    pos: new THREE.Vector3(1.5, 1.18, 8),
    mesh: bedroomDoorMesh,
    parts: bedroomDoorParts,
    isHot: false,
    isOpen: false,
    openAngle: 0,
    axis: 'z',
    interactRadius: 1.6,
    leadsTo: 'bedroom',
    colliderIndex: -1,
  });
  const bedroomDoorColliderIdx = colliders.length;
  addCollider(1.5, 8, 0.15, 0.6);
  doors[doors.length - 1].colliderIndex = bedroomDoorColliderIdx;

  // Hallway north wall removed — passage continues into north wing

  // ==============================================================
  //  NORTH WING HALLWAY  (-1.5..1.5, 11..19)
  // ==============================================================
  b(3, 0.12, 8, M.floor,   0, -0.06,       15);
  b(3, 0.12, 8, M.ceiling, 0, RH + 0.06,   15);

  // West wall with door to utility room (z=14..16)
  b(0.12, RH, 3.1, M.wall, -1.5, RH/2, 12.55);
  b(0.12, RH, 3.1, M.wall, -1.5, RH/2, 17.45);
  b(0.12, 0.645, 2, M.wall, -1.5, 2.6775, 15);
  addCollider(-1.5, 12.55, 0.15, 1.55);
  addCollider(-1.5, 17.45, 0.15, 1.55);

  const utilityDoorMesh = b(0.08, 2.35, 1.8, M.door, -1.55, 1.18, 15);
  const utilityDoorParts = [
    b(0.03, 0.88, 1.38, intPanelMat, -1.568, 1.72, 15),
    b(0.03, 0.80, 1.38, intPanelMat, -1.568, 0.65, 15),
    b(0.07, 0.04, 0.04, M.handle, -1.515, 1.18, 14.25),
    b(0.06, 0.12, 0.04, M.handle, -1.57, 0.38, 15.78),
    b(0.06, 0.12, 0.04, M.handle, -1.57, 1.18, 15.78),
    b(0.06, 0.12, 0.04, M.handle, -1.57, 1.98, 15.78),
  ];
  doors.push({
    pos: new THREE.Vector3(-1.5, 1.18, 15),
    mesh: utilityDoorMesh,
    parts: utilityDoorParts,
    isHot: false, isOpen: false, openAngle: 0,
    axis: 'z', interactRadius: 1.6, leadsTo: 'utility', colliderIndex: -1,
  });
  const utilityDoorColliderIdx = colliders.length;
  addCollider(-1.5, 15, 0.15, 1.0);
  doors[doors.length - 1].colliderIndex = utilityDoorColliderIdx;

  // East wall with door to guest room (z=14..16)
  b(0.12, RH, 3, M.wall, 1.5, RH/2, 12.5);
  b(0.12, RH, 3, M.wall, 1.5, RH/2, 17.5);
  b(0.12, 0.645, 2, M.wall, 1.5, 2.6775, 15);
  addCollider(1.5, 12.5, 0.15, 1.5);
  addCollider(1.5, 17.5, 0.15, 1.5);

  const guestDoorMesh = b(0.08, 2.35, 1.8, M.door, 1.55, 1.18, 15);
  const guestDoorParts = [
    b(0.03, 0.88, 1.38, intPanelMat, 1.568, 1.72, 15),
    b(0.03, 0.80, 1.38, intPanelMat, 1.568, 0.65, 15),
    b(0.07, 0.04, 0.04, M.handle, 1.515, 1.18, 15.75),
    b(0.06, 0.12, 0.04, M.handle, 1.57, 0.38, 14.22),
    b(0.06, 0.12, 0.04, M.handle, 1.57, 1.18, 14.22),
    b(0.06, 0.12, 0.04, M.handle, 1.57, 1.98, 14.22),
  ];
  doors.push({
    pos: new THREE.Vector3(1.5, 1.18, 15),
    mesh: guestDoorMesh,
    parts: guestDoorParts,
    isHot: false, isOpen: false, openAngle: 0,
    axis: 'z', interactRadius: 1.6, leadsTo: 'guest', colliderIndex: -1,
  });
  const guestDoorColliderIdx = colliders.length;
  addCollider(1.5, 15, 0.15, 1.0);
  doors[doors.length - 1].colliderIndex = guestDoorColliderIdx;

  // North hallway end wall
  b(3, RH, 0.12, M.wall, 0, RH/2, 19);
  addCollider(0, 19, 1.5, 0.15);

  // ==============================================================
  //  UTILITY ROOM  (-7..-1.5, 11..19)
  // ==============================================================
  b(5.5, 0.12, 8, M.floor,   -4.25, -0.06,     15);
  b(5.5, 0.12, 8, M.ceiling, -4.25, RH + 0.06, 15);

  // West wall extension (x=-7, z=11..19)
  b(0.12, RH, 8, M.wall, -7, RH/2, 15);
  addCollider(-7, 15, 0.15, 4);

  // North wall (solid)
  b(5.5, RH, 0.12, M.wall, -4.25, RH/2, 19);
  addCollider(-4.25, 19, 2.75, 0.15);

  // Laundry tub — the water source for wetting the towel
  b(0.8, 0.15, 0.55, M.sink, -2.5, 0.85, 14.5);
  b(0.6, 0.8,  0.45, M.tile, -2.5, 0.4,  14.5);
  addCollider(-2.5, 14.5, 0.45, 0.3);

  // Washing machine — body, circular door porthole, control panel strip
  b(0.7, 0.9, 0.65, M.fridge, -6.3, 0.45, 12.0);
  const porthole = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 10, 28), new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.6 }));
  porthole.position.set(-5.97, 0.52, 12.0); porthole.rotation.y = Math.PI / 2; scene.add(porthole);
  const portholeGlass = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), new THREE.MeshLambertMaterial({ color: 0x223344, transparent: true, opacity: 0.6 }));
  portholeGlass.position.set(-5.96, 0.52, 12.0); portholeGlass.rotation.y = Math.PI / 2; scene.add(portholeGlass);
  b(0.04, 0.12, 0.5, new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3 }), -5.97, 0.84, 12.0); // control panel
  addCollider(-6.3, 12.0, 0.4, 0.35);

  // Dryer — body, circular door, vent strip
  b(0.7, 0.9, 0.65, M.fridge, -5.4, 0.45, 12.0);
  const dryerPort = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 10, 28), new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.6 }));
  dryerPort.position.set(-5.07, 0.52, 12.0); dryerPort.rotation.y = Math.PI / 2; scene.add(dryerPort);
  const dryerGlass = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), new THREE.MeshLambertMaterial({ color: 0x2a2a1a, transparent: true, opacity: 0.5 }));
  dryerGlass.position.set(-5.06, 0.52, 12.0); dryerGlass.rotation.y = Math.PI / 2; scene.add(dryerGlass);
  addCollider(-5.4, 12.0, 0.4, 0.35);

  // Storage shelves — back panel + 4 visible shelves
  b(0.04, 1.8, 3.0, M.darkWood, -2.54, 0.9, 11.2); // back panel
  b(3.0, 0.04, 0.35, M.wood, -4.0, 0.0,  11.2);
  b(3.0, 0.04, 0.35, M.wood, -4.0, 0.55, 11.2);
  b(3.0, 0.04, 0.35, M.wood, -4.0, 1.1,  11.2);
  b(3.0, 0.04, 0.35, M.wood, -4.0, 1.65, 11.2);
  addCollider(-4.0, 11.2, 1.5, 0.2);

  // Storage boxes — with lids and labels
  b(0.6, 0.52, 0.6, M.darkWood, -2.3, 0.27, 18.2);
  b(0.58, 0.06, 0.58, M.wood, -2.3, 0.56, 18.2); // lid
  b(0.6, 0.52, 0.6, M.darkWood, -3.0, 0.27, 18.2);
  b(0.58, 0.06, 0.58, M.wood, -3.0, 0.56, 18.2);
  b(0.6, 0.52, 0.6, M.darkWood, -2.3, 0.85, 18.2);
  b(0.58, 0.06, 0.58, new THREE.MeshLambertMaterial({ color: 0xcc8822 }), -2.3, 1.14, 18.2);

  // ==============================================================
  //  GUEST BEDROOM  (1.5..7, 11..19)
  // ==============================================================
  b(5.5, 0.12, 8, M.floor,   4.25, -0.06,     15);
  b(5.5, 0.12, 8, M.ceiling, 4.25, RH + 0.06, 15);

  // East wall extension (x=7, z=11..19)
  b(0.12, RH, 8, M.wall, 7, RH/2, 15);
  addCollider(7, 15, 0.15, 4);

  // North wall (solid)
  b(5.5, RH, 0.12, M.wall, 4.25, RH/2, 19);
  addCollider(4.25, 19, 2.75, 0.15);

  // Guest bed — frame, mattress, blanket, pillows, headboard, footboard
  b(3.0, 0.4, 4.0, M.wood,     5.2, 0.2,  17.0);
  b(2.8, 0.25, 3.8, M.bed,     5.2, 0.45, 17.0);
  b(2.8, 0.27, 2.2, M.blanket,  5.2, 0.46, 16.4);
  b(1.1, 0.13, 0.5, M.bed,      4.55, 0.61, 18.65); // pillow L
  b(1.1, 0.13, 0.5, M.bed,      5.75, 0.61, 18.65); // pillow R
  b(3.0, 0.85, 0.1, M.darkWood, 5.2, 0.85, 19.0);   // headboard
  b(3.0, 0.04, 0.08, M.wood,    5.2, 1.25, 18.97);  // top rail
  b(3.0, 0.4,  0.1, M.darkWood, 5.2, 0.4,  15.0);   // footboard
  addCollider(5.2, 17.0, 1.5, 2.0);

  // Wardrobe — body, two door lines, knobs
  b(1.8, 2.1, 0.6, M.darkWood, 2.3, 1.05, 18.5);
  b(0.03, 1.9, 0.04, M.handle, 2.3, 1.05, 18.22); // centre door split
  b(0.07, 0.07, 0.06, M.handle, 2.65, 1.2, 18.22);
  b(0.07, 0.07, 0.06, M.handle, 1.95, 1.2, 18.22);
  b(1.8, 0.06, 0.58, M.wood, 2.3, 2.13, 18.5); // top trim
  addCollider(2.3, 18.5, 0.9, 0.35);

  // Desk — top, apron, 4 legs, laptop prop
  b(1.4, 0.06, 0.7, M.tableTop, 2.4, 0.78, 12.5);
  b(1.28, 0.05, 0.04, M.wood, 2.4, 0.73, 12.16);
  b(1.28, 0.05, 0.04, M.wood, 2.4, 0.73, 12.84);
  b(0.07, 0.72, 0.07, M.tableLeg, 2.95, 0.39, 12.85);
  b(0.07, 0.72, 0.07, M.tableLeg, 1.85, 0.39, 12.85);
  b(0.07, 0.72, 0.07, M.tableLeg, 2.95, 0.39, 12.15);
  b(0.07, 0.72, 0.07, M.tableLeg, 1.85, 0.39, 12.15);
  // Laptop (closed, on desk)
  b(0.6, 0.03, 0.4, M.frame, 2.5, 0.82, 12.45);
  b(0.58, 0.32, 0.02, M.frame, 2.5, 0.99, 12.27);  // screen lid propped open
  addCollider(2.4, 12.5, 0.6, 0.4, true);

  // Nightstand — body, lamp
  b(0.6, 0.6, 0.5, M.darkWood, 3.2, 0.3, 15.5);
  b(0.05, 0.28, 0.05, M.handle, 3.2, 0.75, 15.3);
  const guestLampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.2, 12), new THREE.MeshLambertMaterial({ color: 0xf0e8d0, side: THREE.DoubleSide }));
  guestLampShade.position.set(3.2, 0.99, 15.3); scene.add(guestLampShade);
  addCollider(3.2, 15.5, 0.35, 0.3);

  // Lights for new rooms
  const hallLight2   = new THREE.PointLight(0xffe8b8, 0.8, 10);
  hallLight2.position.set(0, 2.55, 15);
  scene.add(hallLight2);

  const utilityLight = new THREE.PointLight(0xf0f0ff, 0.9, 12);
  utilityLight.position.set(-4.25, 2.55, 15);
  scene.add(utilityLight);

  const guestLight   = new THREE.PointLight(0xffd7a3, 1.0, 10);
  guestLight.position.set(4.25, 2.55, 15);
  scene.add(guestLight);

  bulbs.push(addBulb(0, 15), addBulb(-4.25, 15), addBulb(4.25, 15));

  // ==============================================================
  //  KITCHEN  (-7..-1.5, 5..11)
  // ==============================================================
  b(5.5, 0.12, 6, M.kitchenTile, -4.25, -0.06, 8);
  b(5.5, 0.12, 6, M.ceiling, -4.25, RH + 0.06, 8);

  // Kitchen west wall
  b(0.12, RH, 6, M.wall, -7, RH/2, 8);
  addCollider(-7, 8, 0.15, 3);

  // Kitchen south wall
  b(5.5, RH, 0.12, M.wall, -4.25, RH/2, 5);
  addCollider(-4.25, 5, 2.75, 0.15);

  // Kitchen north wall (solid — utility room is on the other side)
  b(5.5, RH, 0.12, M.wall, -4.25, RH/2, 11);
  addCollider(-4.25, 11, 2.75, 0.15);

  // Kitchen counters — cabinet body, worktop, door handles
  b(4.5, 0.9, 0.7, M.counter, -4.75, 0.45, 10.3);
  b(4.5, 0.05, 0.72, M.kitchenTile, -4.75, 0.92, 10.3);
  // Cabinet door lines & handles
  b(0.02, 0.6, 0.04, M.darkWood, -3.6, 0.45, 9.97);
  b(0.02, 0.6, 0.04, M.darkWood, -4.6, 0.45, 9.97);
  b(0.02, 0.6, 0.04, M.darkWood, -5.6, 0.45, 9.97);
  b(0.05, 0.05, 0.05, M.handle, -4.05, 0.55, 9.97);
  b(0.05, 0.05, 0.05, M.handle, -5.05, 0.55, 9.97);
  // Backsplash tiles
  b(4.5, 0.6, 0.04, M.tile, -4.75, 1.25, 9.97);
  addCollider(-4.75, 10.3, 2.25, 0.4);

  // Stove — body, 4 burner rings, knobs
  b(2.5, 0.9, 0.7, M.counter, -5.5, 0.45, 5.6);
  b(0.7, 0.04, 0.7, M.stove, -5.5, 0.93, 5.6);
  // Burner rings
  const burnerMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.6 });
  const burnerRing = new THREE.TorusGeometry(0.11, 0.022, 8, 24);
  for (const [bx, bz] of [[-5.8,5.35],[-5.2,5.35],[-5.8,5.85],[-5.2,5.85]]) {
    const br = new THREE.Mesh(burnerRing, burnerMat);
    br.rotation.x = -Math.PI / 2; br.position.set(bx, 0.975, bz); scene.add(br);
  }
  // Knobs
  for (let k = 0; k < 4; k++) {
    b(0.06, 0.06, 0.06, M.handle, -6.1 + k * 0.14, 0.88, 5.3);
  }
  addCollider(-5.5, 5.6, 1.25, 0.4);

  // Fridge — body, door handle, logo strip
  b(0.85, 2.0, 0.75, M.fridge, -6.4, 1.0, 8);
  b(0.04, 1.3, 0.06, M.handle, -6.0, 1.35, 7.68);   // handle bar
  b(0.04, 0.04, 0.04, M.handle, -6.0, 1.28, 7.68);
  b(0.04, 0.04, 0.04, M.handle, -6.0, 2.0,  7.68);
  b(0.6, 0.03, 0.72, new THREE.MeshStandardMaterial({ color: 0xb0b0b0, roughness: 0.3, metalness: 0.4 }), -6.4, 1.01, 8); // bottom border
  addCollider(-6.4, 8, 0.45, 0.4);

  // Kitchen table — top, apron, legs
  b(1.6, 0.06, 1.2, M.tableTop, -3.8, 0.78, 8);
  b(1.46, 0.06, 0.04, M.wood, -3.8, 0.72, 7.43);  // apron front
  b(1.46, 0.06, 0.04, M.wood, -3.8, 0.72, 8.57);  // apron back
  b(0.04, 0.06, 1.08, M.wood, -4.47, 0.72, 8);    // apron side
  b(0.04, 0.06, 1.08, M.wood, -3.13, 0.72, 8);    // apron side
  b(0.07, 0.72, 0.07, M.tableLeg, -4.5, 0.39, 8.5);
  b(0.07, 0.72, 0.07, M.tableLeg, -3.1, 0.39, 8.5);
  b(0.07, 0.72, 0.07, M.tableLeg, -4.5, 0.39, 7.5);
  b(0.07, 0.72, 0.07, M.tableLeg, -3.1, 0.39, 7.5);
  // A mug on the table
  b(0.1, 0.14, 0.1, new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 }), -3.5, 0.85, 8.1);
  addCollider(-3.8, 8, 0.8, 0.6, true);

  // ==============================================================
  //  BEDROOM  (1.5..7, 5..11)
  // ==============================================================
  b(5.5, 0.12, 6, M.floor, 4.25, -0.06, 8);
  b(5.5, 0.12, 6, M.ceiling, 4.25, RH + 0.06, 8);

  // Bedroom east wall (with window)
  b(0.12, RH, 1.5, M.wall, 7, RH/2, 5.75);
  b(0.12, RH, 1.5, M.wall, 7, RH/2, 10.25);
  b(0.12, 0.85, 3, M.wall, 7, 0.425, 8);
  b(0.12, 0.5, 3, M.wall, 7, 2.75, 8);
  addCollider(7, 5.75, 0.15, 0.75);
  addCollider(7, 10.25, 0.15, 0.75);

  // Bedroom window
  const bedroomWindowMesh = b(0.06, 1.65, 2.8, M.window, 7, 1.675, 8);
  bedroomWindowMesh.userData = { isWindow: true, broken: false, id: 2 };
  windows.push({
    pos: new THREE.Vector3(7, 1.5, 8),
    mesh: bedroomWindowMesh,
    broken: false,
    isEscape: true,
    interactRadius: 1.6,
    normal: new THREE.Vector3(1, 0, 0),
  });

  // Bedroom south wall
  b(5.5, RH, 0.12, M.wall, 4.25, RH/2, 5);
  addCollider(4.25, 5, 2.75, 0.15);

  // Bedroom north wall
  b(5.5, RH, 0.12, M.wall, 4.25, RH/2, 11);
  addCollider(4.25, 11, 2.75, 0.15);

  // Bed — frame, mattress, blanket, pillows, headboard
  b(3.2, 0.4, 4.0, M.wood, 5.0, 0.2, 9.0);
  b(3.0, 0.25, 3.8, M.bed, 5.0, 0.45, 9.0);
  b(3.0, 0.27, 2.2, M.blanket, 5.0, 0.46, 8.4);
  // Pillows
  b(1.2, 0.14, 0.55, M.bed, 4.4, 0.62, 10.55);
  b(1.2, 0.14, 0.55, M.bed, 5.6, 0.62, 10.55);
  // Headboard
  b(3.2, 0.9, 0.1, M.darkWood, 5.0, 0.85, 11.0);
  b(3.0, 0.06, 0.08, M.wood, 5.0, 1.3, 10.97); // top rail
  // Footboard
  b(3.2, 0.45, 0.1, M.darkWood, 5.0, 0.45, 7.0);
  addCollider(5.0, 9.0, 1.6, 2.0);

  // Nightstand — body, drawer strip, lamp
  b(0.6, 0.6, 0.5, M.darkWood, 3.0, 0.3, 10.0);
  b(0.5, 0.02, 0.04, M.handle, 3.0, 0.38, 9.76); // drawer line
  b(0.06, 0.06, 0.06, M.handle, 3.0, 0.38, 9.76);
  // Bedside lamp
  b(0.06, 0.32, 0.06, M.handle, 3.0, 0.76, 9.82);  // stem
  const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.22, 12), new THREE.MeshLambertMaterial({ color: 0xf0e8d0, side: THREE.DoubleSide }));
  lampShade.position.set(3.0, 1.02, 9.82); scene.add(lampShade);
  addCollider(3.0, 10.0, 0.35, 0.3);

  // ==============================================================
  //  BATHROOM  (1.5..5, -8..-5) — accessed from living room east
  // ==============================================================
  // Bathroom connection: through the east wall opening of living room
  // Small corridor from living room east wall to bathroom
  b(3.5, 0.12, 3, M.tile, 3.25, -0.06, -8);
  b(3.5, 0.12, 3, M.ceiling, 3.25, RH + 0.06, -8);

  // Add a short passage from living room east window area down to bathroom
  // East passage floor/ceiling
  b(2, 0.12, 3.5, M.floor, 6, -0.06, -3.25);
  b(2, 0.12, 3.5, M.ceiling, 6, RH + 0.06, -3.25);

  // Passage walls
  b(0.12, RH, 3.5, M.wall, 7, RH/2, -3.25);
  addCollider(7, -3.25, 0.15, 1.75);
  b(2, RH, 0.12, M.wall, 6, RH/2, -1.5);
  addCollider(6, -1.5, 1, 0.15);

  // Passage south connects to bathroom
  // Bathroom walls
  b(0.12, RH, 3, M.wall, 1.5, RH/2, -8);    // west wall
  addCollider(1.5, -8, 0.15, 1.5);
  b(3.5, RH, 0.12, M.wall, 3.25, RH/2, -9.5);  // south wall
  addCollider(3.25, -9.5, 1.75, 0.15);
  b(0.12, RH, 4.5, M.wall, 5, RH/2, -7.25);    // partial east
  addCollider(5, -7.25, 0.15, 2.25);

  // North bathroom wall (connection to passage)
  b(2.0, RH, 0.12, M.wall, 2.5, RH/2, -6.5);
  addCollider(2.5, -6.5, 1.0, 0.15);

  // Bathroom door (between passage and bathroom)
  b(1.75, 0.645, 0.12, M.wall, 4.375, 2.6775, -6.5);
  const bathroomDoorMesh = b(1.5, 2.35, 0.08, M.door, 4.25, 1.18, -6.5);
  const bathroomDoorParts = [
    b(1.18, 0.84, 0.03, intPanelMat, 4.25, 1.72, -6.508),
    b(1.18, 0.78, 0.03, intPanelMat, 4.25, 0.64, -6.508),
    b(0.04, 0.04, 0.07, M.handle, 3.6, 1.18, -6.5),
    b(0.04, 0.12, 0.06, M.handle, 4.94, 0.38, -6.508),
    b(0.04, 0.12, 0.06, M.handle, 4.94, 1.18, -6.508),
    b(0.04, 0.12, 0.06, M.handle, 4.94, 1.98, -6.508),
  ];
  doors.push({
    pos: new THREE.Vector3(4.25, 1.18, -6.5),
    mesh: bathroomDoorMesh,
    parts: bathroomDoorParts,
    isHot: false,
    isOpen: false,
    openAngle: 0,
    axis: 'x',
    interactRadius: 1.6,
    leadsTo: 'bathroom',
    colliderIndex: -1,
  });
  const bathroomDoorColliderIdx = colliders.length;
  addCollider(4.25, -6.5, 0.75, 0.15);
  doors[doors.length - 1].colliderIndex = bathroomDoorColliderIdx;

  // Bathroom furniture
  // Sink — basin, pedestal, faucet, two taps
  b(0.8, 0.1,  0.5, M.sink, 3.8, 0.88, -9.1);
  b(0.7, 0.05, 0.4, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.1 }), 3.8, 0.84, -9.1); // basin rim
  b(0.6, 0.8,  0.4, M.tile, 3.8, 0.4,  -9.1);  // pedestal
  // Faucet spout + two tap handles
  b(0.04, 0.14, 0.04, M.handle, 3.8,  0.98, -9.22);
  b(0.14, 0.03, 0.04, M.handle, 3.8,  1.1,  -9.22);
  b(0.08, 0.04, 0.04, M.handle, 3.64, 0.95, -9.22);
  b(0.08, 0.04, 0.04, M.handle, 3.96, 0.95, -9.22);
  addCollider(3.8, -9.1, 0.45, 0.3);

  // Mirror — frame + reflective surface
  b(0.75, 0.95, 0.06, M.frame,  3.8, 1.72, -9.42);
  b(0.62, 0.82, 0.04, M.mirror, 3.8, 1.72, -9.40);

  // Bathtub — shell, rim, faucet
  b(1.6, 0.5, 0.7, M.tile, 2.3, 0.25, -9.0);
  b(1.6, 0.06, 0.7, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }), 2.3, 0.52, -9.0); // rim
  b(0.04, 0.22, 0.04, M.handle, 1.7, 0.6, -8.68); // bath tap
  b(0.1,  0.03, 0.04, M.handle, 1.7, 0.8, -8.68);
  addCollider(2.3, -9.0, 0.85, 0.4);

  // Towel (the cloth item to pick up!)
  const towelMesh = b(0.5, 0.06, 0.35, M.towel, clothPos.x, clothPos.y, clothPos.z);
  towelMesh.userData = { isTowel: true };

  // Towel rack — two brackets + bar
  b(0.04, 0.04, 0.08, M.handle, 2.0, 1.2, -9.27);
  b(0.04, 0.04, 0.08, M.handle, 2.0, 1.2, -9.53);
  b(0.04, 0.04, 0.3,  M.handle, 2.0, 1.2, -9.4);

  // Towel on guest bedroom nightstand; sink in utility room laundry tub
  clothPos.set(3.2, 0.63, 15.5);
  sinkPos.set(-2.5, 0.9, 14.5);
  towelMesh.position.copy(clothPos);

  // ── Item beacons ─────────────────────────────────────────────
  // Yellow pulsing light + spinning ring above the towel
  const towelBeaconLight = new THREE.PointLight(0xffcc00, 2.5, 3.5);
  towelBeaconLight.position.set(clothPos.x, clothPos.y + 1.2, clothPos.z);
  scene.add(towelBeaconLight);
  const towelRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.038, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  towelRing.rotation.x = -Math.PI / 2;
  towelRing.position.set(clothPos.x, clothPos.y + 0.55, clothPos.z);
  scene.add(towelRing);

  // Cyan pulsing light + spinning ring above the laundry tub (shown once towel is held)
  const sinkBeaconLight = new THREE.PointLight(0x00ccff, 2.2, 3.5);
  sinkBeaconLight.position.set(sinkPos.x, sinkPos.y + 1.2, sinkPos.z);
  scene.add(sinkBeaconLight);
  const sinkRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.038, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0x44eeff, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  sinkRing.rotation.x = -Math.PI / 2;
  sinkRing.position.set(sinkPos.x, sinkPos.y + 0.55, sinkPos.z);
  scene.add(sinkRing);

  // ==============================================================
  //  FRONT DOOR (exit collider – initially solid)
  // ==============================================================
  const frontDoorColliderIdx = colliders.length;
  addCollider(0.8, -5, 0.5, 0.15);

  // ==============================================================
  //  FIRE SYSTEM
  // ==============================================================

  // Fire particle pool
  const fireGeo = new THREE.SphereGeometry(0.18, 6, 6);
  const fireColors = [0xff1100, 0xff4400, 0xff7700, 0xffaa00, 0xffee00];

  function createFireParticle() {
    const mat = new THREE.MeshBasicMaterial({
      color: fireColors[Math.floor(Math.random() * fireColors.length)],
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(fireGeo, mat);
    mesh.visible = false;
    mesh.userData = { life: 0, maxLife: 0, vx: 0, vy: 0, vz: 0, baseScale: 1 };
    scene.add(mesh);
    return mesh;
  }

  for (let i = 0; i < 600; i++) {
    fireParticles.push(createFireParticle());
  }

  function spawnFireParticle(origin, radius) {
    const p = fireParticles.find(fp => !fp.visible);
    if (!p) return;
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * radius * 0.9;
    p.position.set(
      origin.x + Math.cos(angle) * r,
      0.05 + Math.random() * 0.4,
      origin.z + Math.sin(angle) * r
    );
    p.userData.vx = (Math.random() - 0.5) * 0.8;
    p.userData.vy = 2.5 + Math.random() * 4.0;
    p.userData.vz = (Math.random() - 0.5) * 0.8;
    p.userData.life = 0;
    p.userData.maxLife = 0.5 + Math.random() * 0.9;
    p.userData.baseScale = 1.5 + Math.random() * 3.5;
    p.visible = true;
    p.material.color.setHex(fireColors[Math.floor(Math.random() * fireColors.length)]);
    p.material.opacity = 0.85 + Math.random() * 0.1;
  }

  function updateFireParticles(dt) {
    for (const p of fireParticles) {
      if (!p.visible) continue;
      p.userData.life += dt;
      if (p.userData.life >= p.userData.maxLife) {
        p.visible = false;
        continue;
      }
      const t = p.userData.life / p.userData.maxLife;
      p.position.x += p.userData.vx * dt;
      p.position.y += p.userData.vy * dt;
      p.position.z += p.userData.vz * dt;
      p.userData.vy -= 1.2 * dt;
      const scale = p.userData.baseScale * (1 - t * 0.6);
      p.scale.setScalar(scale);
      p.material.opacity = (1 - t) * 0.9;
      // Stay bright orange/yellow longer, only go dark near end
      if (t > 0.82) {
        p.material.color.setHex(0x661100);
      } else if (t > 0.65) {
        p.material.color.setHex(0xff3300);
      }
    }
  }

  const fireGlowGeo = new THREE.CircleGeometry(1, 20);
  const fireGlowMatBase = new THREE.MeshBasicMaterial({
    color: 0xff3300,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  function addFireSpot(x, z, delay, maxRadius, growRate) {
    const light = new THREE.PointLight(0xff5500, 0, maxRadius * 6);
    light.position.set(x, 1.5, z);
    scene.add(light);

    // Floor glow disk
    const glow = new THREE.Mesh(fireGlowGeo, fireGlowMatBase.clone());
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x, 0.06, z);
    glow.scale.setScalar(0);
    scene.add(glow);

    fireSpots.push({
      pos: new THREE.Vector3(x, 0, z),
      radius: 0,
      startTime: delay,
      maxRadius: maxRadius || 2.0,
      growRate: growRate || 0.3,
      active: false,
      light,
      glow,
    });
  }

  // Fire origin: kitchen stove (faster spread, bigger fires)
  addFireSpot(-5.5, 5.6, 0,  2.0, 0.9);        // stove fire (immediate)
  addFireSpot(-4.0, 6.5, 3,  2.2, 0.7);         // kitchen spreads
  addFireSpot(-6.0, 8.0, 6,  2.0, 0.6);         // kitchen far side
  addFireSpot(-3.0, 5.5, 9,  1.8, 0.55);        // kitchen door area
  addFireSpot(-1.0, 6.0, 13, 1.6, 0.6);         // hallway entrance
  addFireSpot(0,    8.5, 20, 2.0, 0.5);          // hallway
  addFireSpot(-1.5, 3.5, 28, 1.8, 0.45);        // living room (late)
  addFireSpot(0,    0,   40, 2.0, 0.35);         // living room center
  addFireSpot(-4.25, 13, 48, 1.5, 0.3);         // utility room
  addFireSpot(4.25,  13, 54, 1.5, 0.28);        // guest room

  // ==============================================================
  //  INTERACTION SYSTEM
  // ==============================================================
  let interactPrompt = '';
  let canInteract = false;
  let interactTarget = null;
  let interactType = '';

  function checkInteractions() {
    const p = camera.position;
    interactPrompt = '';
    canInteract = false;
    interactTarget = null;
    interactType = '';
    nearCloth = false;
    nearSink = false;

    // Check towel pickup
    if (!hasCloth) {
      const dCloth = p.distanceTo(clothPos);
      if (dCloth < 1.5) {
        nearCloth = true;
        interactPrompt = 'Press [E] to pick up towel';
        canInteract = true;
        interactType = 'cloth';
      }
    }

    // Check sink (wet the cloth)
    if (hasCloth && !clothIsWet) {
      const dSink = p.distanceTo(sinkPos);
      if (dSink < 1.5) {
        nearSink = true;
        interactPrompt = 'Press [E] to wet the towel';
        canInteract = true;
        interactType = 'sink';
      }
    }

    // Check doors
    for (const door of doors) {
      if (door.isOpen) continue;
      const dDoor = p.distanceTo(door.pos);
      if (dDoor < door.interactRadius) {
        if (door.isHot && gameState === STATE.FIRE) {
          interactPrompt = '⚠ Door is HOT! Press [E] to open (DANGER)';
        } else {
          interactPrompt = 'Press [E] to open door';
        }
        canInteract = true;
        interactTarget = door;
        interactType = 'door';
        break;
      }
    }

    // Check windows
    for (const win of windows) {
      if (win.broken) continue;
      const dWin = new THREE.Vector3(p.x, p.y, p.z).distanceTo(win.pos);
      if (dWin < win.interactRadius) {
        interactPrompt = 'Press [E] to break window';
        canInteract = true;
        interactTarget = win;
        interactType = 'window';
        break;
      }
    }

    // Check broken windows for escape
    for (const win of windows) {
      if (!win.broken || !win.isEscape) continue;
      const dWin = new THREE.Vector3(p.x, p.y, p.z).distanceTo(win.pos);
      if (dWin < 1.2) {
        interactPrompt = 'Press [E] to ESCAPE!';
        canInteract = true;
        interactTarget = win;
        interactType = 'escape';
        break;
      }
    }

    // Check front door for escape
    const dFront = Math.sqrt(p.x * p.x + Math.pow(p.z + 5, 2));
    if (dFront < 1.8) {
      interactPrompt = 'Press [E] to ESCAPE through front door!';
      canInteract = true;
      interactType = 'frontDoor';
    }
  }

  function doInteract() {
    if (!canInteract) return;

    if (interactType === 'cloth') {
      hasCloth = true;
      towelMesh.visible = false;
      flashScreen("rgba(100,200,100,0.3)", 300);
      return;
    }

    if (interactType === 'sink') {
      clothIsWet = true;
      if (!sounds.sizzle.isPlaying) sounds.sizzle.play();
      flashScreen("rgba(100,150,255,0.3)", 300);
      return;
    }

    if (interactType === 'door') {
      const door = interactTarget;
      if (door.isHot) {
        health -= 15;
        panic = Math.min(100, panic + 15);
        flashScreen("rgba(255,100,0,0.5)", 400);
        if (sounds.sizzle.isPlaying) sounds.sizzle.stop();
        sounds.sizzle.play();
      }
      door.isOpen = true;
      door.mesh.visible = false;
      for (const p of (door.parts || [])) p.visible = false;
      // Remove door collider
      if (door.colliderIndex >= 0) {
        colliders[door.colliderIndex].minX = 99999;
        colliders[door.colliderIndex].maxX = 99999;
      }
      return;
    }

    if (interactType === 'window') {
      const win = interactTarget;
      win.broken = true;
      win.mesh.material = new THREE.MeshLambertMaterial({ color: 0x000000, transparent: true, opacity: 0.05 });
      if (!sounds.glass.isPlaying) sounds.glass.play();
      flashScreen("rgba(200,230,255,0.3)", 250);
      return;
    }

    if (interactType === 'escape' || interactType === 'frontDoor') {
      frontDoorMesh.visible = false;
      for (const p of frontDoorParts) p.visible = false;
      colliders[frontDoorColliderIdx].minX = 99999;
      colliders[frontDoorColliderIdx].maxX = 99999;
      escaped = true;
      showOutcome();
      return;
    }
  }

  // ==============================================================
  //  CONTROLS
  // ==============================================================
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  let isLocked = false;
  let isPaused = false;
  const PITCH_MAX = Math.PI / 2.2;

  function setPaused(val) {
    isPaused = val;
    const pm = document.getElementById("pause-menu");
    if (pm) pm.style.display = isPaused ? "flex" : "none";
  }

  canvas.addEventListener("click", () => {
    if (gameState !== STATE.DONE && !isPaused) {
      canvas.requestPointerLock();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
  });

  document.addEventListener("pointerlockchange", () => {
    isLocked = document.pointerLockElement === canvas;
    const hint = document.getElementById("game-hint");
    // If pointer lock was released while game is running, show pause menu
    if (!isLocked && gameState !== STATE.DONE) {
      if (hint) hint.style.display = "none";
      setPaused(true);
    } else {
      if (hint) hint.style.display = isLocked ? "none" : "flex";
      setPaused(false);
    }
  });

  document.addEventListener("keydown", e => {
    if (e.code === "Escape" && gameState !== STATE.DONE) {
      if (isPaused) {
        // Resume
        canvas.requestPointerLock();
      }
      // if not paused, the browser will release pointer lock which triggers pointerlockchange → setPaused(true)
    }
  }, true); // capture phase so it fires before the browser default

  let mouseSens = 0.8; // 0.1 – 2.0 range, default 0.8

  document.addEventListener("mousemove", e => {
    if (!isLocked) return;
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= e.movementX * 0.004 * mouseSens;
    euler.x -= e.movementY * 0.004 * mouseSens;
    euler.x = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, euler.x));
    camera.quaternion.setFromEuler(euler);
  });

  const keys = {};
  document.addEventListener("keydown", e => {
    keys[e.code] = true;
    if (e.code === "KeyC") isCrouching = !isCrouching;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys["Shift"] = true;
    if (e.code === "KeyE") doInteract();
  });

  document.addEventListener("keyup", e => {
    keys[e.code] = false;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys["Shift"] = false;
  });

  // ── Movement ────────────────────────────────────────────────
  const WALK_SPEED = 4.5;
  const SPRINT_SPEED = 5.8;
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

    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    rgt.crossVectors(fwd, camera.up).normalize();

    mdir.set(0, 0, 0);
    if (keys["KeyW"] || keys["ArrowUp"]) mdir.add(fwd);
    if (keys["KeyS"] || keys["ArrowDown"]) mdir.sub(fwd);
    if (keys["KeyA"] || keys["ArrowLeft"]) mdir.sub(rgt);
    if (keys["KeyD"] || keys["ArrowRight"]) mdir.add(rgt);

    const isMoving = mdir.lengthSq() > 0;
    isSprinting = keys["Shift"] && isMoving && !isCrouching && stamina > 0;

    if (isSprinting) {
      const panicDrainMul = 1 + (panic / 100) * 1.5;
      stamina = Math.max(0, stamina - (25 * panicDrainMul * dt));
    } else {
      stamina = Math.min(100, stamina + (15 * dt));
    }

    const currentSpeed = isSprinting ? SPRINT_SPEED : WALK_SPEED;
    const crouchMul = isCrouching ? 0.5 : 1.0;
    const spd = currentSpeed * crouchMul * dt;

    if (isMoving) {
      mdir.normalize().multiplyScalar(spd);
      let nx = camera.position.x + mdir.x;
      let nz = camera.position.z;
      const rx = resolveColliders(nx, nz);
      nx = rx.px; nz = rx.pz;
      nz += mdir.z;
      const rz = resolveColliders(nx, nz);
      nx = rz.px; nz = rz.pz;

      // World bounds
      camera.position.x = Math.max(-6.8, Math.min(6.8, nx));
      camera.position.z = Math.max(-9.3, Math.min(18.8, nz));
    }
    camera.position.y = currentEyeY;
  }

  // ── Fire proximity damage ───────────────────────────────────
  function checkFireDamage(dt) {
    const p = camera.position;
    let inFire = false;
    for (const fire of fireSpots) {
      if (!fire.active || fire.radius < 0.3) continue;
      const dx = p.x - fire.pos.x;
      const dz = p.z - fire.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < fire.radius + 0.5) {
        inFire = true;
        const closeness = 1 - Math.min(1, dist / (fire.radius + 0.5));
        health -= 20 * closeness * dt;
        panic = Math.min(100, panic + 15 * closeness * dt);
        if (Math.random() < 0.1 * closeness) {
          flashScreen("rgba(255,80,0,0.25)", 100);
        }
      }
    }
    return inFire;
  }

  // ── Smoke & suffocation ─────────────────────────────────────
  function updateSmoke(dt) {
    if (gameState !== STATE.FIRE) return;

    // Smoke builds over time, faster with more active fires
    const activeFires = fireSpots.filter(f => f.active).length;
    const smokeRate = 0.008 + activeFires * 0.003;
    smokeLevel = Math.min(1, smokeLevel + smokeRate * dt);

    // Crouching: smoke is less dense near floor
    const smokeAtPlayer = isCrouching ? smokeLevel * 0.35 : smokeLevel;

    // Oxygen drain
    let oxygenDrain = smokeAtPlayer * 12; // base drain from smoke
    if (clothIsWet) {
      oxygenDrain *= 0.2;  // wet cloth blocks 80% smoke
    } else if (hasCloth) {
      oxygenDrain *= 0.5;  // dry cloth blocks 50%
    }

    oxygen = Math.max(0, oxygen - oxygenDrain * dt);

    // Recover oxygen slightly if smoke is low at player level
    if (smokeAtPlayer < 0.2) {
      oxygen = Math.min(100, oxygen + 5 * dt);
    }

    // Coughing
    if (smokeAtPlayer > 0.3 && !clothIsWet) {
      coughCooldown -= dt;
      if (coughCooldown <= 0) {
        if (!sounds.cough.isPlaying) sounds.cough.play();
        coughCooldown = 2 + Math.random() * 3;
        if (!hasCloth) panic = Math.min(100, panic + 3);
      }
    }

    // Oxygen depletion damage
    if (oxygen <= 0) {
      health -= 15 * dt;
      panic = Math.min(100, panic + 10 * dt);
    }

    // Update fog based on smoke
    const fogNear = Math.max(1, 18 - smokeLevel * 16);
    const fogFar = Math.max(4, 40 - smokeLevel * 34);
    scene.fog.near = fogNear;
    scene.fog.far = fogFar;

    // Smoke color shift
    const smokeColor = new THREE.Color().lerpColors(
      new THREE.Color(0x1a1008),
      new THREE.Color(0x222222),
      smokeLevel * 0.7
    );
    scene.fog.color.copy(smokeColor);
    scene.background.copy(smokeColor);
  }

  // ── Door heat ───────────────────────────────────────────────
  function updateDoorHeat() {
    for (const door of doors) {
      if (door.isOpen) continue;
      // Check if any fire is near the other side of this door
      let nearFire = false;
      for (const fire of fireSpots) {
        if (!fire.active) continue;
        const d = door.pos.distanceTo(fire.pos);
        if (d < fire.radius + 2.0) {
          nearFire = true;
          break;
        }
      }
      door.isHot = nearFire;
      // Visual: make hot doors glow slightly
      if (door.isHot) {
        door.mesh.material.emissive = new THREE.Color(0x331100);
        door.mesh.material.emissiveIntensity = 0.5 + Math.sin(performance.now() * 0.005) * 0.3;
      } else {
        door.mesh.material.emissive = new THREE.Color(0x000000);
        door.mesh.material.emissiveIntensity = 0;
      }
    }
  }

  // ==============================================================
  //  HUD
  // ==============================================================
  let staminaFill, panicFill, healthFill, oxygenFill;
  let timerEl, statusEl, outcomeEl, promptEl;

  function buildHUD() {
    const wrapper = canvas.parentElement;

    // Hint overlay
    const hint = document.createElement("div"); hint.id = "game-hint";
    hint.innerHTML = `<div class="gh-title">🔥 HOUSE FIRE SCENARIO</div><div class="gh-sub">Click anywhere to enter</div><div class="gh-keys"><span>WASD</span> Move &nbsp;·&nbsp;<span>Shift</span> Sprint &nbsp;·&nbsp;<span>Mouse</span> Look &nbsp;·&nbsp;<span>C</span> Crouch &nbsp;·&nbsp;<span>E</span> Interact &nbsp;·&nbsp;<span>Esc</span> Exit</div><div class="gh-warn">⚠ A fire will start in the kitchen in 20 seconds. Find a way out.</div>`;
    wrapper.appendChild(hint);

    // Crosshair
    const cross = document.createElement("div"); cross.id = "game-crosshair";
    cross.innerHTML = `<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="8" stroke="rgba(255,255,255,.75)" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="16" x2="12" y2="22" stroke="rgba(255,255,255,.75)" stroke-width="1.5" stroke-linecap="round"/><line x1="2" y1="12" x2="8" y2="12" stroke="rgba(255,255,255,.75)" stroke-width="1.5" stroke-linecap="round"/><line x1="16" y1="12" x2="22" y2="12" stroke="rgba(255,255,255,.75)" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="1.2" fill="rgba(255,255,255,.6)"/></svg>`;
    cross.style.display = "none";
    wrapper.appendChild(cross);
    document.addEventListener("pointerlockchange", () => { cross.style.display = document.pointerLockElement === canvas ? "block" : "none"; });

    // Health
    const hw = document.createElement("div"); hw.id = "health-wrap";
    hw.innerHTML = `<div id="health-label">HEALTH</div><div id="health-bar"><div id="health-fill"></div></div>`;
    wrapper.appendChild(hw);
    healthFill = document.getElementById("health-fill");

    // Stamina
    const sw = document.createElement("div"); sw.id = "stamina-wrap";
    sw.innerHTML = `<div id="stamina-label">STAMINA</div><div id="stamina-bar"><div id="stamina-fill"></div></div>`;
    wrapper.appendChild(sw);
    staminaFill = document.getElementById("stamina-fill");

    // Oxygen
    const ow = document.createElement("div"); ow.id = "oxygen-wrap";
    ow.innerHTML = `<div id="oxygen-label">OXYGEN</div><div id="oxygen-bar"><div id="oxygen-fill"></div></div>`;
    wrapper.appendChild(ow);
    oxygenFill = document.getElementById("oxygen-fill");

    // Panic
    const pw = document.createElement("div"); pw.id = "panic-wrap";
    pw.innerHTML = `<div id="panic-label">PANIC</div><div id="panic-bar"><div id="panic-fill"></div></div>`;
    wrapper.appendChild(pw);
    panicFill = document.getElementById("panic-fill");

    // Pause menu
    const pauseMenu = document.createElement("div");
    pauseMenu.id = "pause-menu";
    pauseMenu.style.cssText = `
      position:absolute;inset:0;display:none;align-items:center;justify-content:center;
      background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);z-index:70;pointer-events:auto;`;
    pauseMenu.innerHTML = `
      <div style="background:rgba(12,14,12,0.97);border:1px solid rgba(255,255,255,0.1);border-radius:12px;
                  padding:40px 52px;min-width:340px;display:flex;flex-direction:column;align-items:center;gap:24px;">
        <div style="font-family:'Oswald',sans-serif;font-size:1.8rem;font-weight:700;letter-spacing:0.1em;
                    text-transform:uppercase;color:#f0ece4;">PAUSED</div>
        <div style="width:100%;border-top:1px solid rgba(255,255,255,0.08);"></div>

        <div style="width:100%;display:flex;flex-direction:column;gap:14px;">
          <div style="font-family:'Share Tech Mono',monospace;font-size:0.65rem;letter-spacing:0.25em;
                      color:rgba(255,255,255,0.4);text-transform:uppercase;">Settings</div>

          <div style="display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:600;
                           letter-spacing:0.06em;color:#d1c9bb;">Mouse Sensitivity</span>
              <span id="pause-sens-value" style="font-family:'Share Tech Mono',monospace;font-size:0.85rem;
                                                 color:#fbbf24;min-width:30px;text-align:right;">0.8</span>
            </div>
            <input id="pause-sens-slider" type="range" min="10" max="200" value="80"
              style="width:100%;accent-color:#fbbf24;cursor:pointer;height:6px;">
            <div style="display:flex;justify-content:space-between;font-family:'Share Tech Mono',monospace;
                        font-size:0.6rem;color:rgba(255,255,255,0.25);">
              <span>LOW</span><span>HIGH</span>
            </div>
          </div>
        </div>

        <div style="width:100%;border-top:1px solid rgba(255,255,255,0.08);"></div>

        <button id="pause-resume-btn"
          style="font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:700;
                 letter-spacing:0.15em;text-transform:uppercase;color:#fff;
                 background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.25);
                 border-radius:6px;padding:12px 40px;cursor:pointer;width:100%;
                 transition:background 0.2s,border-color 0.2s;">
          Resume
        </button>
        <div style="font-family:'Share Tech Mono',monospace;font-size:0.65rem;color:rgba(255,255,255,0.25);
                    letter-spacing:0.1em;">Press ESC or click Resume to continue</div>
      </div>`;
    wrapper.appendChild(pauseMenu);

    document.getElementById("pause-sens-slider").addEventListener("input", e => {
      mouseSens = parseInt(e.target.value) / 100;
      document.getElementById("pause-sens-value").textContent = mouseSens.toFixed(1);
    });
    const resumeBtn = document.getElementById("pause-resume-btn");
    resumeBtn.addEventListener("mouseenter", () => {
      resumeBtn.style.background = "rgba(255,255,255,0.16)";
      resumeBtn.style.borderColor = "rgba(255,255,255,0.4)";
    });
    resumeBtn.addEventListener("mouseleave", () => {
      resumeBtn.style.background = "rgba(255,255,255,0.08)";
      resumeBtn.style.borderColor = "rgba(255,255,255,0.25)";
    });
    resumeBtn.addEventListener("click", () => {
      canvas.requestPointerLock();
    });

    timerEl = document.createElement("div"); timerEl.id = "game-timer"; wrapper.appendChild(timerEl);
    statusEl = document.createElement("div"); statusEl.id = "game-status"; statusEl.textContent = "Explore the house. Something smells like smoke..."; wrapper.appendChild(statusEl);

    // Interaction prompt
    promptEl = document.createElement("div"); promptEl.id = "interact-prompt";
    promptEl.style.cssText = `position:absolute;bottom:130px;left:50%;transform:translateX(-50%);font-family:var(--font-cond,'Barlow Condensed',sans-serif);font-size:1.2rem;font-weight:700;letter-spacing:0.06em;color:#fff;background:rgba(0,0,0,0.75);border:2px solid rgba(255,255,255,0.3);padding:10px 24px;border-radius:8px;pointer-events:none;z-index:25;display:none;text-align:center;text-shadow:0 1px 4px rgba(0,0,0,0.9);box-shadow:0 4px 16px rgba(0,0,0,0.4);`;
    wrapper.appendChild(promptEl);

    // Crouch indicator
    const crouchEl = document.createElement("div"); crouchEl.id = "crouch-indicator"; crouchEl.textContent = "▼ CROUCHING"; crouchEl.style.display = "none"; wrapper.appendChild(crouchEl);

    // Item indicator
    const itemEl = document.createElement("div"); itemEl.id = "item-indicator";
    itemEl.style.cssText = `position:absolute;top:188px;left:20px;font-family:var(--font-cond,'Barlow Condensed',sans-serif);font-size:0.95rem;font-weight:700;letter-spacing:0.08em;color:#e8e0d0;background:rgba(0,0,0,0.65);border:2px solid rgba(255,255,255,0.18);padding:8px 16px;border-radius:6px;pointer-events:none;z-index:20;display:none;text-shadow:0 1px 3px rgba(0,0,0,0.8);box-shadow:0 2px 8px rgba(0,0,0,0.3);`;
    wrapper.appendChild(itemEl);

    outcomeEl = document.createElement("div"); outcomeEl.id = "outcome-screen"; outcomeEl.style.display = "none"; wrapper.appendChild(outcomeEl);
  }

  function updateHUD() {
    if (!panicFill) return;

    // Stamina
    staminaFill.style.width = stamina + "%";
    staminaFill.style.backgroundColor = stamina < 25 ? "#f87171" : "#38bdf8";

    // Panic
    const p = panic / 100;
    panicFill.style.width = panic + "%";
    panicFill.style.background = `rgb(${Math.round(p * 210)},${Math.round((1 - p) * 170 + 20)},20)`;

    // Health
    const h = health / 100;
    healthFill.style.width = Math.max(0, health) + "%";
    healthFill.style.background = `rgb(${Math.round((1 - h) * 210)},${Math.round(h * 170 + 20)},20)`;

    // Oxygen
    const o = oxygen / 100;
    oxygenFill.style.width = oxygen + "%";
    if (oxygen < 30) {
      oxygenFill.style.background = '#ef4444';
    } else if (oxygen < 60) {
      oxygenFill.style.background = '#fbbf24';
    } else {
      oxygenFill.style.background = '#38bdf8';
    }

    // Crouch indicator
    const crouchEl = document.getElementById("crouch-indicator");
    if (crouchEl) crouchEl.style.display = isCrouching ? "block" : "none";

    // Item indicator
    const itemEl = document.getElementById("item-indicator");
    if (itemEl) {
      if (clothIsWet) {
        itemEl.style.display = "block";
        itemEl.textContent = "🧣 WET TOWEL (face covered)";
        itemEl.style.borderColor = "rgba(74,222,128,0.4)";
        itemEl.style.color = "#4ade80";
      } else if (hasCloth) {
        itemEl.style.display = "block";
        itemEl.textContent = "🧣 DRY TOWEL — find water!";
        itemEl.style.borderColor = "rgba(251,191,36,0.4)";
        itemEl.style.color = "#fbbf24";
      } else {
        itemEl.style.display = "none";
      }
    }

    // Interaction prompt
    if (promptEl) {
      if (interactPrompt && gameState !== STATE.DONE) {
        promptEl.style.display = "block";
        promptEl.textContent = interactPrompt;
      } else {
        promptEl.style.display = "none";
      }
    }

    // Heartbeat
    if (panic > 70 && sounds.heartbeat.buffer && !sounds.heartbeat.isPlaying) {
      sounds.heartbeat.play();
    } else if (panic <= 70 && sounds.heartbeat.isPlaying) {
      sounds.heartbeat.stop();
    }
    if (sounds.heartbeat.isPlaying) {
      sounds.heartbeat.setVolume((panic - 70) / 30);
    }

    // Status text
    if (gameState === STATE.CALM) {
      const rem = Math.ceil(CALM_DURATION - calmTimer);
      timerEl.textContent = "";
      statusEl.textContent = rem > 10
        ? "Explore the house. Something smells like smoke..."
        : "⚠ There's a strange crackling from the kitchen...";
      statusEl.style.color = rem > 10 ? "#d1c9bb" : "#fbbf24";
    }

    if (gameState === STATE.FIRE) {
      timerEl.textContent = `FIRE: ${Math.ceil(FIRE_DURATION - fireTimer)}s`;

      if (oxygen < 25 && !clothIsWet) {
        statusEl.textContent = "⚠ YOU CAN'T BREATHE! Find a towel & wet it, or CROUCH LOW!";
        statusEl.style.color = "#ef4444";
      } else if (!hasCloth) {
        statusEl.textContent = "Grab the glowing towel in this room! [E]";
        statusEl.style.color = "#fbbf24";
      } else if (hasCloth && !clothIsWet) {
        statusEl.textContent = "Wet the towel at the laundry tub — cross the hall into the other room!";
        statusEl.style.color = "#38bdf8";
      } else {
        statusEl.textContent = "GET OUT! Use the front door or break a window!";
        statusEl.style.color = "#4ade80";
      }
    }
  }

  // ==============================================================
  //  FLASH & SMOKE OVERLAY
  // ==============================================================
  function flashScreen(color, duration) {
    const wrapper = canvas.parentElement;
    const fl = document.createElement("div");
    fl.style.cssText = `position:absolute;inset:0;background:${color};pointer-events:none;z-index:60;transition:opacity ${duration}ms ease;`;
    wrapper.appendChild(fl);
    requestAnimationFrame(() => { fl.style.opacity = "0"; });
    setTimeout(() => fl.remove(), duration + 50);
  }

  // Persistent smoke overlay
  const smokeOverlay = document.createElement("div");
  smokeOverlay.id = "smoke-overlay";
  smokeOverlay.style.cssText = `position:absolute;inset:0;background:rgba(30,28,26,0);pointer-events:none;z-index:15;transition:background 0.5s ease;`;

  // ==============================================================
  //  OUTCOME
  // ==============================================================
  function showOutcome() {
    gameState = STATE.DONE;
    document.exitPointerLock();

    if (sounds.fire.isPlaying) sounds.fire.stop();
    if (sounds.heartbeat.isPlaying) sounds.heartbeat.stop();

    const hint = document.getElementById("game-hint");
    if (hint) hint.style.display = "none";

    let title, body, oxygenResult, accent;

    if (!escaped && health <= 0) {
      if (oxygen <= 0) {
        title = "SUFFOCATED";
        body = "Smoke inhalation got you before the flames did. Covering your mouth with a wet cloth and staying low could have bought you time to escape.";
      } else {
        title = "YOU DIDN'T SURVIVE";
        body = "The fire was too intense. In a real fire, you have about 2 minutes to escape. Always know your exits beforehand.";
      }
      oxygenResult = "Oxygen: DEPLETED";
      accent = "#ef4444";
    } else if (escaped && health < 40) {
      title = "BARELY ESCAPED";
      body = "You made it out, but with serious injuries. Next time: stay low, cover your face, and don't open hot doors. Every second counts.";
      oxygenResult = `Oxygen: ${Math.round(oxygen)}%`;
      accent = "#f97316";
    } else if (escaped && !clothIsWet) {
      title = "ESCAPED — SMOKE DAMAGE";
      body = "You got out, but without proper face protection. A wet cloth over your mouth filters smoke particles and buys critical time.";
      oxygenResult = `Oxygen: ${Math.round(oxygen)}%`;
      accent = "#facc15";
    } else if (escaped) {
      title = "ESCAPED — WELL DONE";
      body = "Excellent survival instincts. You found face protection, stayed composed, and found an exit. The Survival Encyclopedia's method saves lives.";
      oxygenResult = `Oxygen: ${Math.round(oxygen)}%`;
      accent = "#4ade80";
    } else {
      title = "TIME'S UP";
      body = "The fire consumed the house before you could escape. In a fire, every second is critical — know your exits and move fast.";
      oxygenResult = "Oxygen: CRITICAL";
      accent = "#ef4444";
    }

    outcomeEl.style.display = "flex";
    outcomeEl.innerHTML = `
      <div class="outcome-box">
        <div class="outcome-badge" style="background:${accent}22;border-color:${accent}55">SCENARIO COMPLETE</div>
        <div class="outcome-title" style="color:${accent}">${title}</div>
        <div class="outcome-body">${body}</div>
        <div class="outcome-stats">
          <div class="outcome-stat" style="color:${accent}">${oxygenResult}</div>
          <div class="outcome-stat">Health: <strong>${Math.max(0, Math.round(health))}%</strong></div>
          <div class="outcome-stat">Panic: <strong>${Math.round(panic)}%</strong></div>
          <div class="outcome-stat">${clothIsWet ? '✓ Wet towel used' : hasCloth ? '⚠ Dry towel only' : '✗ No face protection'}</div>
        </div>
        <button class="outcome-btn" onclick="location.reload()">↩ Try Again</button>
        <button class="menu-btn" onclick="backToMenu()">← Back to Menu</button>
      </div>
    `;
  }

  // ==============================================================
  //  INIT & LOOP
  // ==============================================================
  buildHUD();
  canvas.parentElement.appendChild(smokeOverlay);

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

    if (isPaused) {
      lastTime = now; // prevent dt spike on resume
      renderer.render(scene, camera);
      return;
    }

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const t = now * 0.001;

    updateMovement(dt);
    checkInteractions();

    // Animate item beacons
    const towelVisible = !hasCloth;
    towelBeaconLight.visible = towelVisible;
    towelRing.visible = towelVisible;
    if (towelVisible) {
      towelRing.position.y = clothPos.y + 0.5 + Math.sin(t * 3.5) * 0.1;
      towelRing.rotation.z = t * 2.5;
      towelBeaconLight.intensity = 2.0 + Math.sin(t * 5.0) * 0.7;
    }
    const sinkVisible = hasCloth && !clothIsWet;
    sinkBeaconLight.visible = sinkVisible;
    sinkRing.visible = sinkVisible;
    if (sinkVisible) {
      sinkRing.position.y = sinkPos.y + 0.5 + Math.sin(t * 3.5 + 1.2) * 0.1;
      sinkRing.rotation.z = t * 2.5;
      sinkBeaconLight.intensity = 2.0 + Math.sin(t * 5.0 + 1.2) * 0.7;
    }

    // ── CALM PHASE ──────────────────────────────────────────
    if (gameState === STATE.CALM) {
      calmTimer += dt;
      panic += (28 - panic) * 0.5 * dt;

      // Pre-fire hints
      if (calmTimer > CALM_DURATION - 6) {
        const flicker = Math.sin(t * 8) * 0.15;
        kitchenLight.intensity = 1.2 + flicker;
      }

      if (calmTimer >= CALM_DURATION) {
        gameState = STATE.FIRE;
        flashScreen("rgba(255,120,0,0.6)", 600);

        if (sounds.fire.buffer && !sounds.fire.isPlaying) {
          sounds.fire.play();
        }
      }
    }

    // ── FIRE PHASE ──────────────────────────────────────────
    if (gameState === STATE.FIRE) {
      fireTimer += dt;

      // Update fire spots
      for (const fire of fireSpots) {
        if (fireTimer >= fire.startTime && !fire.active) {
          fire.active = true;
        }
        if (fire.active) {
          fire.radius = Math.min(fire.maxRadius, fire.radius + fire.growRate * dt);
          // Update light
          const flicker = 0.8 + Math.sin(t * 13 + fire.pos.x) * 0.35 + Math.sin(t * 27 + fire.pos.z) * 0.2;
          fire.light.intensity = fire.radius * 5.0 * flicker;
          fire.light.distance = fire.radius * 7;

          // Update floor glow disk
          const glowFlicker = 0.9 + Math.sin(t * 9 + fire.pos.x) * 0.12;
          fire.glow.scale.setScalar(fire.radius * glowFlicker);
          fire.glow.material.opacity = Math.min(0.6, fire.radius * 0.28) * glowFlicker;

          // Spawn multiple fire particles per frame based on radius
          const spawnCount = Math.floor(fire.radius * 3.5) + (Math.random() < fire.radius ? 1 : 0);
          for (let s = 0; s < spawnCount; s++) {
            spawnFireParticle(fire.pos, fire.radius);
          }
        }
      }

      updateFireParticles(dt);
      checkFireDamage(dt);
      updateSmoke(dt);
      updateDoorHeat();

      // Sound volume based on proximity to fire
      if (sounds.fire.isPlaying) {
        let maxProx = 0;
        const p = camera.position;
        for (const fire of fireSpots) {
          if (!fire.active) continue;
          const d = Math.sqrt(Math.pow(p.x - fire.pos.x, 2) + Math.pow(p.z - fire.pos.z, 2));
          const prox = Math.max(0, 1 - d / 12);
          maxProx = Math.max(maxProx, prox);
        }
        sounds.fire.setVolume(0.3 + maxProx * 1.5);
      }

      // Smoke overlay opacity
      const smokeAtPlayer = isCrouching ? smokeLevel * 0.35 : smokeLevel;
      smokeOverlay.style.background = `rgba(30,28,26,${smokeAtPlayer * 0.65})`;

      // Light flickering during fire
      const fireProgress = fireTimer / FIRE_DURATION;
      const dimming = Math.max(0, 1 - fireProgress * 0.8);
      livingLight.intensity = 1.4 * dimming + Math.sin(t * 15) * 0.2;
      hallLight.intensity = 0.8 * dimming + Math.sin(t * 11) * 0.15;
      kitchenLight.intensity = 0.3; // kitchen is on fire, light mostly from flames
      bedroomLight.intensity = 1.0 * dimming;
      bathroomLight.intensity = 0.9 * dimming;

      // Bulb flickering
      for (const bulb of bulbs) {
        const dim = Math.random() < 0.08 * fireProgress;
        bulb.material.color.setHex(dim ? 0x554433 : 0xffffee);
      }

      // Panic from being exposed to fire without protection
      if (!clothIsWet && smokeLevel > 0.3) {
        panic = Math.min(100, panic + 5 * dt);
      }

      // Auto-lose conditions
      if (health <= 0 || fireTimer >= FIRE_DURATION) {
        showOutcome();
        return;
      }

      renderer.render(scene, camera);
      updateHUD();
      return;
    }

    updateHUD();
    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
})();