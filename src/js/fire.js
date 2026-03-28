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
    towel:    new THREE.MeshLambertMaterial({ color: 0xe8e0d0 }),
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

  // South wall (front, has front door / exit window)
  b(3.5, RH, 0.12, M.wall, -3.25, RH/2, -5);   // left section
  b(3.5, RH, 0.12, M.wall, 3.25, RH/2, -5);     // right section
  b(3, 0.6, 0.12, M.wall, 0, 2.7, -5);           // above door
  addCollider(-3.25, -5, 1.75, 0.15);
  addCollider(3.25, -5, 1.75, 0.15);

  // Front door (exit!) - centered in south wall
  const frontDoorMesh = b(2.8, 2.35, 0.08, M.door, 0, 1.18, -5);
  // Door frame
  b(0.14, 2.4, 0.18, M.doorFr, -1.5, 1.2, -5);
  b(0.14, 2.4, 0.18, M.doorFr, 1.5, 1.2, -5);
  b(3.0, 0.18, 0.18, M.doorFr, 0, 2.4, -5);

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

  // Sofa
  b(3.4, 0.48, 1.0, M.sofa, -1.5, 0.24, 3.2);
  b(3.4, 0.9, 0.24, M.sofa, -1.5, 0.69, 3.68);
  b(0.24, 0.68, 1.0, M.sofa, -3.1, 0.48, 3.2);
  b(0.24, 0.68, 1.0, M.sofa, 0.1, 0.48, 3.2);
  addCollider(-1.5, 3.2, 1.75, 0.6);

  // Coffee table
  b(2.2, 0.08, 1.2, M.tableTop, -1.5, 0.45, 1.2);
  b(0.08, 0.4, 0.08, M.tableLeg, -2.5, 0.2, 1.7);
  b(0.08, 0.4, 0.08, M.tableLeg, -0.5, 0.2, 1.7);
  b(0.08, 0.4, 0.08, M.tableLeg, -2.5, 0.2, 0.7);
  b(0.08, 0.4, 0.08, M.tableLeg, -0.5, 0.2, 0.7);
  addCollider(-1.5, 1.2, 1.1, 0.6, true);

  // TV stand
  b(2.8, 0.5, 0.55, M.darkWood, -1.5, 0.25, -4.0);
  b(2.0, 1.2, 0.08, M.frame, -1.5, 1.1, -4.3);
  addCollider(-1.5, -4.0, 1.4, 0.3);

  // Bookshelf right side
  b(0.4, 2.2, 0.8, M.wood, 4.0, 1.1, -3.5);
  addCollider(4.0, -3.5, 0.25, 0.45);

  // Plant
  b(0.32, 0.42, 0.32, M.pot, -4.4, 0.21, -3.5);
  const plantMesh = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 8), M.plant);
  plantMesh.position.set(-4.4, 0.78, -3.5);
  plantMesh.castShadow = true;
  scene.add(plantMesh);

  // ==============================================================
  //  HALLWAY  (-1.5..1.5, 5..11)
  // ==============================================================
  b(3, 0.12, 6, M.floor, 0, -0.06, 8);
  b(3, 0.12, 6, M.ceiling, 0, RH + 0.06, 8);

  // Hallway west wall (with door to kitchen)
  b(0.12, RH, 2.0, M.wall, -1.5, RH/2, 6.0);
  b(0.12, RH, 2.0, M.wall, -1.5, RH/2, 10.0);
  b(0.12, 0.6, 3, M.wall, -1.5, 2.7, 8);
  addCollider(-1.5, 6.0, 0.15, 1.0);
  addCollider(-1.5, 10.0, 0.15, 1.0);

  // Kitchen door opening (hallway west, z=7..9)
  const kitchenDoorMesh = b(0.08, 2.35, 1.8, M.door, -1.55, 1.18, 8);
  doors.push({
    pos: new THREE.Vector3(-1.5, 1.18, 8),
    mesh: kitchenDoorMesh,
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
  b(0.12, RH, 2.0, M.wall, 1.5, RH/2, 6.0);
  b(0.12, RH, 2.0, M.wall, 1.5, RH/2, 10.0);
  b(0.12, 0.6, 3, M.wall, 1.5, 2.7, 8);
  addCollider(1.5, 6.0, 0.15, 1.0);
  addCollider(1.5, 10.0, 0.15, 1.0);

  // Bedroom door (hallway east, z=7..9)
  const bedroomDoorMesh = b(0.08, 2.35, 1.8, M.door, 1.55, 1.18, 8);
  doors.push({
    pos: new THREE.Vector3(1.5, 1.18, 8),
    mesh: bedroomDoorMesh,
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
  b(0.12, RH, 3, M.wall, -1.5, RH/2, 12.5);
  b(0.12, RH, 3, M.wall, -1.5, RH/2, 17.5);
  b(0.12, 0.6, 2, M.wall, -1.5, 2.7, 15);
  addCollider(-1.5, 12.5, 0.15, 1.5);
  addCollider(-1.5, 17.5, 0.15, 1.5);

  const utilityDoorMesh = b(0.08, 2.35, 1.8, M.door, -1.55, 1.18, 15);
  doors.push({
    pos: new THREE.Vector3(-1.5, 1.18, 15),
    mesh: utilityDoorMesh,
    isHot: false, isOpen: false, openAngle: 0,
    axis: 'z', interactRadius: 1.6, leadsTo: 'utility', colliderIndex: -1,
  });
  const utilityDoorColliderIdx = colliders.length;
  addCollider(-1.5, 15, 0.15, 1.0);
  doors[doors.length - 1].colliderIndex = utilityDoorColliderIdx;

  // East wall with door to guest room (z=14..16)
  b(0.12, RH, 3, M.wall, 1.5, RH/2, 12.5);
  b(0.12, RH, 3, M.wall, 1.5, RH/2, 17.5);
  b(0.12, 0.6, 2, M.wall, 1.5, 2.7, 15);
  addCollider(1.5, 12.5, 0.15, 1.5);
  addCollider(1.5, 17.5, 0.15, 1.5);

  const guestDoorMesh = b(0.08, 2.35, 1.8, M.door, 1.55, 1.18, 15);
  doors.push({
    pos: new THREE.Vector3(1.5, 1.18, 15),
    mesh: guestDoorMesh,
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

  // Washing machine + dryer
  b(0.7, 0.9, 0.65, M.fridge, -6.3, 0.45, 12.0);
  addCollider(-6.3, 12.0, 0.4, 0.35);
  b(0.7, 0.9, 0.65, M.fridge, -5.4, 0.45, 12.0);
  addCollider(-5.4, 12.0, 0.4, 0.35);

  // Storage shelves on south side
  b(3.0, 1.8, 0.35, M.wood, -4.0, 0.9, 11.2);
  addCollider(-4.0, 11.2, 1.5, 0.2);

  // Storage boxes
  b(0.6, 0.6, 0.6, M.darkWood, -2.3, 0.3, 18.2);
  b(0.6, 0.6, 0.6, M.darkWood, -3.0, 0.3, 18.2);
  b(0.6, 0.6, 0.6, M.darkWood, -2.3, 0.9, 18.2);

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

  // Guest bed
  b(3.0, 0.4, 4.0, M.wood,    5.2, 0.2,  17.0);
  b(2.8, 0.25, 3.8, M.bed,    5.2, 0.45, 17.0);
  b(2.8, 0.27, 2.2, M.blanket, 5.2, 0.46, 16.4);
  addCollider(5.2, 17.0, 1.5, 2.0);

  // Wardrobe
  b(1.8, 2.1, 0.6, M.darkWood, 2.3, 1.05, 18.5);
  addCollider(2.3, 18.5, 0.9, 0.35);

  // Desk and chair area
  b(1.4, 0.06, 0.7, M.tableTop, 2.4, 0.78, 12.5);
  b(0.06, 0.72, 0.06, M.tableLeg, 2.95, 0.39, 12.85);
  b(0.06, 0.72, 0.06, M.tableLeg, 1.85, 0.39, 12.85);
  b(0.06, 0.72, 0.06, M.tableLeg, 2.95, 0.39, 12.15);
  b(0.06, 0.72, 0.06, M.tableLeg, 1.85, 0.39, 12.15);
  addCollider(2.4, 12.5, 0.6, 0.4, true);

  // Nightstand
  b(0.6, 0.6, 0.5, M.darkWood, 3.2, 0.3, 15.5);
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

  // Kitchen counters
  b(4.5, 0.9, 0.7, M.counter, -4.75, 0.45, 10.3);
  b(4.5, 0.05, 0.72, M.kitchenTile, -4.75, 0.92, 10.3);
  addCollider(-4.75, 10.3, 2.25, 0.4);

  // Stove (on south counter)
  b(0.7, 0.12, 0.7, M.stove, -5.5, 0.97, 5.6);
  b(2.5, 0.9, 0.7, M.counter, -5.5, 0.45, 5.6);
  addCollider(-5.5, 5.6, 1.25, 0.4);

  // Fridge
  b(0.85, 2.0, 0.75, M.fridge, -6.4, 1.0, 8);
  addCollider(-6.4, 8, 0.45, 0.4);

  // Kitchen table
  b(1.6, 0.06, 1.2, M.tableTop, -3.8, 0.78, 8);
  b(0.06, 0.72, 0.06, M.tableLeg, -4.5, 0.39, 8.5);
  b(0.06, 0.72, 0.06, M.tableLeg, -3.1, 0.39, 8.5);
  b(0.06, 0.72, 0.06, M.tableLeg, -4.5, 0.39, 7.5);
  b(0.06, 0.72, 0.06, M.tableLeg, -3.1, 0.39, 7.5);
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

  // Bed
  b(3.2, 0.4, 4.0, M.wood, 5.0, 0.2, 9.0);
  b(3.0, 0.25, 3.8, M.bed, 5.0, 0.45, 9.0);
  b(3.0, 0.27, 2.2, M.blanket, 5.0, 0.46, 8.4);
  addCollider(5.0, 9.0, 1.6, 2.0);

  // Nightstand
  b(0.6, 0.6, 0.5, M.darkWood, 3.0, 0.3, 10.0);
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
  b(1.75, 0.6, 0.12, M.wall, 4.375, 2.7, -6.5);
  const bathroomDoorMesh = b(1.5, 2.35, 0.08, M.door, 4.25, 1.18, -6.5);
  doors.push({
    pos: new THREE.Vector3(4.25, 1.18, -6.5),
    mesh: bathroomDoorMesh,
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
  // Sink
  b(0.8, 0.15, 0.5, M.sink, 3.8, 0.85, -9.1);
  b(0.6, 0.8, 0.4, M.tile, 3.8, 0.4, -9.1);
  addCollider(3.8, -9.1, 0.45, 0.3);

  // Mirror above sink
  b(0.7, 0.9, 0.05, M.mirror, 3.8, 1.7, -9.4);

  // Bathtub
  b(1.6, 0.5, 0.7, M.tile, 2.3, 0.25, -9.0);
  addCollider(2.3, -9.0, 0.85, 0.4);

  // Towel (the cloth item to pick up!)
  const towelMesh = b(0.5, 0.06, 0.35, M.towel, clothPos.x, clothPos.y, clothPos.z);
  towelMesh.userData = { isTowel: true };

  // Towel rack
  b(0.04, 0.04, 0.8, M.handle, 2.0, 1.2, -9.4);

  // Towel on guest bedroom nightstand; sink in utility room laundry tub
  clothPos.set(3.2, 0.63, 15.5);
  sinkPos.set(-2.5, 0.9, 14.5);
  towelMesh.position.copy(clothPos);

  // ==============================================================
  //  FRONT DOOR (exit collider – initially solid)
  // ==============================================================
  const frontDoorColliderIdx = colliders.length;
  addCollider(0, -5, 1.5, 0.15);

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
  const PITCH_MAX = Math.PI / 2.2;

  canvas.addEventListener("click", () => {
    if (gameState !== STATE.DONE) {
      canvas.requestPointerLock();
      if (audioCtx.state === 'suspended') audioCtx.resume();
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

    timerEl = document.createElement("div"); timerEl.id = "game-timer"; wrapper.appendChild(timerEl);
    statusEl = document.createElement("div"); statusEl.id = "game-status"; statusEl.textContent = "Explore the house. Something smells like smoke..."; wrapper.appendChild(statusEl);

    // Interaction prompt
    promptEl = document.createElement("div"); promptEl.id = "interact-prompt";
    promptEl.style.cssText = `position:absolute;bottom:80px;left:50%;transform:translateX(-50%);font-family:var(--font-cond,'Barlow Condensed',sans-serif);font-size:1.1rem;font-weight:600;letter-spacing:0.08em;color:#fff;background:rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.25);padding:8px 18px;border-radius:6px;pointer-events:none;z-index:25;display:none;text-align:center;`;
    wrapper.appendChild(promptEl);

    // Crouch indicator
    const crouchEl = document.createElement("div"); crouchEl.id = "crouch-indicator"; crouchEl.textContent = "▼ CROUCHING"; crouchEl.style.display = "none"; wrapper.appendChild(crouchEl);

    // Item indicator
    const itemEl = document.createElement("div"); itemEl.id = "item-indicator";
    itemEl.style.cssText = `position:absolute;top:110px;left:30px;font-family:var(--font-cond,'Barlow Condensed',sans-serif);font-size:0.85rem;font-weight:600;letter-spacing:0.1em;color:#e8e0d0;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);padding:5px 12px;border-radius:4px;pointer-events:none;z-index:20;display:none;`;
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
        statusEl.textContent = "Find something to cover your face! Check the bathroom.";
        statusEl.style.color = "#fbbf24";
      } else if (hasCloth && !clothIsWet) {
        statusEl.textContent = "Wet the towel at a sink! Then find an exit!";
        statusEl.style.color = "#fbbf24";
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

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const t = now * 0.001;

    updateMovement(dt);
    checkInteractions();

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