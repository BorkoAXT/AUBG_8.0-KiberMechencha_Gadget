// ============================================================
//  woods.js  –  Survival Encyclopedia  |  Scenario 3: Lost in Woods
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
  renderer.toneMappingExposure = 0.78;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x3a4a5a);
  scene.fog = new THREE.Fog(0x3a4a5a, 25, 100);

  const camera = new THREE.PerspectiveCamera(72, canvas.clientWidth / canvas.clientHeight, 0.05, 300);
  camera.rotation.order = "YXZ";
  camera.position.set(0, 1.7, 0);

  // ── Audio ───────────────────────────────────────────────────
  const listener = new THREE.AudioListener();
  camera.add(listener);
  const sounds = {
    wind: new THREE.Audio(listener),
    heartbeat: new THREE.Audio(listener),
    fire: new THREE.Audio(listener),
    snap: new THREE.Audio(listener),
  };
  const audioCtx = THREE.AudioContext.getContext();

  function createWindBuffer() {
    const len = audioCtx.sampleRate * 4;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const t = i / audioCtx.sampleRate;
      last = (last + 0.015 * (Math.random() * 2 - 1)) / 1.015;
      d[i] = last * 2.5 * (0.6 + 0.4 * Math.sin(t * 0.7));
    }
    return buf;
  }
  function createHeartbeatBuffer() {
    const len = audioCtx.sampleRate * 1;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / audioCtx.sampleRate;
      const e1 = Math.exp(-t * 15), e2 = t > 0.25 ? Math.exp(-(t - 0.25) * 15) : 0;
      d[i] = Math.sin(t * 40 * Math.PI * 2) * (e1 + e2) * 1.5;
    }
    return buf;
  }
  function createCampfireBuffer() {
    const len = audioCtx.sampleRate * 3;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
      const crackle = Math.random() < 0.003 ? (Math.random() - 0.5) * 2 : 0;
      d[i] = (last * 2 + crackle) * 0.6;
    }
    return buf;
  }
  function createSnapBuffer() {
    const len = audioCtx.sampleRate * 0.2;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / audioCtx.sampleRate;
      d[i] = (Math.random() - 0.5) * Math.exp(-t * 30) * 2;
    }
    return buf;
  }

  sounds.wind.setBuffer(createWindBuffer()); sounds.wind.setLoop(true); sounds.wind.setVolume(0.3);
  sounds.heartbeat.setBuffer(createHeartbeatBuffer()); sounds.heartbeat.setLoop(true); sounds.heartbeat.setVolume(0);
  sounds.fire.setBuffer(createCampfireBuffer()); sounds.fire.setLoop(true); sounds.fire.setVolume(0);
  sounds.snap.setBuffer(createSnapBuffer()); sounds.snap.setVolume(0.5);

  // ── Game state ──────────────────────────────────────────────
  const STATE = { EXPLORE: 0, DONE: 1 };
  let gameState = STATE.EXPLORE;
  let gameTimer = 0;
  const GAME_DURATION = 180; // 3 minutes

  let panic = 20;
  let health = 100;
  let stamina = 100;
  let warmth = 100;
  let isSprinting = false;

  const EYE_STAND = 1.7;
  const EYE_CROUCH = 0.85;
  let isCrouching = false;
  let currentEyeY = EYE_STAND;

  // ── Shelter system ──────────────────────────────────────────
  let foundShelter = false;
  let shelterType = ''; // 'village', 'house', 'cave', 'diy'
  let inShelter = false;

  // Fire-making (for non-village shelters)
  let hasSticks = 0;   // need 3
  let hasRocks = 0;    // need 2
  let fireLit = false;
  let fireProgress = 0; // 0-100, interact to build up

  // ── Interaction ─────────────────────────────────────────────
  let interactPrompt = '';
  let canInteract = false;
  let interactType = '';
  let interactTarget = null;

  // ── World layout ────────────────────────────────────────────
  // Forest area: roughly -80 to 80 on X and Z
  // Village: far north-east at (65, 0, -70) with a beacon light
  // Path: winding from (0,0) toward village
  // Shelters along the path:
  //   Cave: (30, 0, -25)
  //   Abandoned house: (-20, 0, -45)
  //   DIY shelter spot: (10, 0, -55) (flat clearing)
  // Sticks/rocks scattered along path

  const VILLAGE_POS = new THREE.Vector3(65, 0, -70);
  const CAVE_POS = new THREE.Vector3(30, 0, -25);
  const HOUSE_POS = new THREE.Vector3(-20, 0, -45);
  const DIY_POS = new THREE.Vector3(10, 0, -55);

  // Collectibles
  const stickPositions = [
    new THREE.Vector3(8, 0, -8),
    new THREE.Vector3(15, 0, -18),
    new THREE.Vector3(22, 0, -12),
    new THREE.Vector3(-5, 0, -22),
    new THREE.Vector3(5, 0, -35),
    new THREE.Vector3(-12, 0, -38),
    new THREE.Vector3(35, 0, -30),
    new THREE.Vector3(18, 0, -50),
  ];
  const rockPositions = [
    new THREE.Vector3(12, 0, -5),
    new THREE.Vector3(25, 0, -20),
    new THREE.Vector3(-8, 0, -30),
    new THREE.Vector3(0, 0, -42),
    new THREE.Vector3(40, 0, -15),
  ];
  const stickMeshes = [];
  const rockMeshes = [];
  const collectedSticks = new Set();
  const collectedRocks = new Set();

  // ── Materials ───────────────────────────────────────────────
  const M = {
    ground: new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.98 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.95 }),
    leaves: new THREE.MeshStandardMaterial({ color: 0x2a5a1a, roughness: 0.9 }),
    leavesDark: new THREE.MeshStandardMaterial({ color: 0x1a3a0a, roughness: 0.92 }),
    leavesYellow: new THREE.MeshStandardMaterial({ color: 0x6a7a1a, roughness: 0.9 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.85 }),
    rockDark: new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.9 }),
    path: new THREE.MeshStandardMaterial({ color: 0x5a4a35, roughness: 0.95 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 }),
    woodOld: new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.95 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x7a6a5a, roughness: 0.92 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.88 }),
    stick: new THREE.MeshLambertMaterial({ color: 0x6a4a2a }),
    rockItem: new THREE.MeshLambertMaterial({ color: 0x888888 }),
    villageWall: new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.85 }),
    villageRoof: new THREE.MeshStandardMaterial({ color: 0x6a2a1a, roughness: 0.8 }),
    window: new THREE.MeshBasicMaterial({ color: 0xffdd88 }),
    moss: new THREE.MeshLambertMaterial({ color: 0x2a4a1a }),
    snow: new THREE.MeshLambertMaterial({ color: 0xccccbb }),
  };

  // ── Lights ──────────────────────────────────────────────────
  const ambientLight = new THREE.AmbientLight(0x8090a8, 0.4);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0x6080a0, 0x1a2a0a, 0.4);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xffe8c0, 0.55);
  sunLight.position.set(30, 40, -20);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -60;
  sunLight.shadow.camera.right = 60;
  sunLight.shadow.camera.top = 60;
  sunLight.shadow.camera.bottom = -60;
  sunLight.shadow.bias = -0.001;
  scene.add(sunLight);

  // Village beacon light (visible from far)
  const villageBeacon = new THREE.PointLight(0xffaa44, 3.0, 200);
  villageBeacon.position.set(VILLAGE_POS.x, 8, VILLAGE_POS.z);
  scene.add(villageBeacon);

  // Campfire light (starts invisible)
  const campfireLight = new THREE.PointLight(0xff6622, 0, 15);
  campfireLight.position.set(0, 0.5, 0);
  scene.add(campfireLight);

  // ── Colliders ───────────────────────────────────────────────
  const colliders = [];
  function addCollider(px, pz, hw, hd) {
    colliders.push({ minX: px - hw, maxX: px + hw, minZ: pz - hd, maxZ: pz + hd });
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

  // ── Path waypoints (defined early so terrain can flatten along it) ──
  const pathPoints = [
    [0, 0], [8, -8], [18, -14], [25, -20], [28, -28],
    [20, -35], [15, -42], [12, -50], [18, -55], [28, -58],
    [38, -55], [48, -60], [55, -65], [62, -68], [65, -70],
  ];

  // ── GROUND (mountainous terrain) ─────────────────────────────
  const TERRAIN_SIZE = 200;
  const TERRAIN_SEGS = 128;
  const groundGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGS, TERRAIN_SEGS);
  groundGeo.rotateX(-Math.PI / 2);

  // Height function: layered noise for mountain feel
  function terrainHeight(x, z) {
    // Large rolling hills
    let h = Math.sin(x * 0.018 + 1.3) * Math.cos(z * 0.022 - 0.7) * 6;
    // Medium ridges
    h += Math.sin(x * 0.045 + z * 0.035) * 2.5;
    h += Math.cos(x * 0.06 - z * 0.04 + 2.1) * 1.8;
    // Small bumps
    h += Math.sin(x * 0.15 + 0.5) * Math.sin(z * 0.12 + 1.0) * 0.8;
    h += Math.cos(x * 0.2 + z * 0.18) * 0.4;

    // Flatten near player start
    const distFromStart = Math.sqrt(x * x + z * z);
    if (distFromStart < 12) {
      h *= Math.max(0, (distFromStart - 4) / 8);
    }
    // Flatten near shelters
    const flattenNear = (sx, sz, r) => {
      const d = Math.sqrt((x - sx) * (x - sx) + (z - sz) * (z - sz));
      if (d < r) h *= Math.max(0.1, (d - r * 0.3) / (r * 0.7));
    };
    flattenNear(CAVE_POS.x, CAVE_POS.z, 10);
    flattenNear(HOUSE_POS.x, HOUSE_POS.z, 12);
    flattenNear(DIY_POS.x, DIY_POS.z, 8);
    flattenNear(VILLAGE_POS.x, VILLAGE_POS.z, 20);

    // Flatten along path corridor
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const [px1, pz1] = pathPoints[i];
      const [px2, pz2] = pathPoints[i + 1];
      const dx = px2 - px1, dz = pz2 - pz1;
      const len = Math.sqrt(dx * dx + dz * dz);
      const t = Math.max(0, Math.min(1, ((x - px1) * dx + (z - pz1) * dz) / (len * len)));
      const cx = px1 + t * dx, cz = pz1 + t * dz;
      const dPath = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
      if (dPath < 4) h *= Math.max(0.15, (dPath - 1) / 3);
    }

    return h;
  }

  const posAttr = groundGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    posAttr.setY(i, terrainHeight(x, z));
  }
  groundGeo.computeVertexNormals();

  // Vertex-colored ground: greener valleys, grey/brown ridges
  const groundColors = new Float32Array(posAttr.count * 3);
  for (let i = 0; i < posAttr.count; i++) {
    const h = posAttr.getY(i);
    const t = Math.max(0, Math.min(1, (h + 2) / 10)); // 0=low, 1=high
    const r = 0.18 + t * 0.2 + (Math.random() * 0.04);
    const g = 0.28 - t * 0.1 + (Math.random() * 0.04);
    const b = 0.12 + t * 0.05;
    groundColors[i * 3] = r;
    groundColors[i * 3 + 1] = g;
    groundColors[i * 3 + 2] = b;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(groundColors, 3));

  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.0,
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // Helper: get terrain Y at world position
  function getTerrainY(wx, wz) {
    return terrainHeight(wx, wz);
  }

  // ── PROCEDURAL TREES ────────────────────────────────────────
  const treePositions = [];
  const RNG = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
  const rng = RNG(42);

  // Keep areas clear around shelters and paths
  function isValidTreePos(x, z) {
    // Clear around player start
    if (Math.sqrt(x * x + z * z) < 6) return false;
    // Clear near shelters
    if (CAVE_POS.distanceTo(new THREE.Vector3(x, 0, z)) < 8) return false;
    if (HOUSE_POS.distanceTo(new THREE.Vector3(x, 0, z)) < 10) return false;
    if (DIY_POS.distanceTo(new THREE.Vector3(x, 0, z)) < 7) return false;
    if (VILLAGE_POS.distanceTo(new THREE.Vector3(x, 0, z)) < 18) return false;
    // Path corridor (rough)
    const px = x, pz = z;
    // Main path goes roughly from (0,0) NE toward village
    const pathDist = Math.abs(px * 0.7 + pz * 0.7 + 10);
    if (pathDist < 2.5) return false;
    return true;
  }

  function makeTree(x, z) {
    const ty = getTerrainY(x, z);
    const h = 4 + rng() * 6;
    const r = 0.15 + rng() * 0.2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, h, 6), M.trunk);
    trunk.position.set(x, ty + h / 2, z);
    trunk.castShadow = true;
    scene.add(trunk);

    const leafMats = [M.leaves, M.leavesDark, M.leavesYellow];
    const leafMat = leafMats[Math.floor(rng() * 3)];
    const crownR = 1.5 + rng() * 2.5;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(crownR, 7, 6), leafMat);
    crown.position.set(x + (rng() - 0.5) * 0.5, ty + h + crownR * 0.4, z + (rng() - 0.5) * 0.5);
    crown.castShadow = true;
    scene.add(crown);

    if (rng() > 0.4) {
      const cr2 = crownR * 0.6;
      const c2 = new THREE.Mesh(new THREE.SphereGeometry(cr2, 6, 5), leafMat);
      c2.position.set(x + (rng() - 0.5) * 2, ty + h * 0.75 + cr2 * 0.3, z + (rng() - 0.5) * 2);
      c2.castShadow = true;
      scene.add(c2);
    }

    addCollider(x, z, r + 0.2, r + 0.2);
    treePositions.push({ x, z });
  }

  for (let i = 0; i < 400; i++) {
    const x = (rng() - 0.5) * 180;
    const z = (rng() - 0.5) * 180;
    if (isValidTreePos(x, z)) makeTree(x, z);
  }

  // ── GROUND ROCKS (decoration) ───────────────────────────────
  for (let i = 0; i < 80; i++) {
    const x = (rng() - 0.5) * 160;
    const z = (rng() - 0.5) * 160;
    const s = 0.3 + rng() * 1.2;
    const ty = getTerrainY(x, z);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rng() > 0.5 ? M.rock : M.rockDark);
    rock.position.set(x, ty + s * 0.3, z);
    rock.rotation.set(rng() * 2, rng() * 2, rng() * 2);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
    if (s > 0.8) addCollider(x, z, s * 0.5, s * 0.5);
  }

  // ── Mountain ridges (large rock formations on peaks) ────────
  for (let i = 0; i < 25; i++) {
    const x = (rng() - 0.5) * 170;
    const z = (rng() - 0.5) * 170;
    if (!isValidTreePos(x, z)) continue;
    const ty = getTerrainY(x, z);
    if (ty < 2) continue; // only on elevated areas
    const s = 1.5 + rng() * 3;
    const ridge = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), M.rockDark);
    ridge.position.set(x, ty + s * 0.4, z);
    ridge.rotation.set(rng(), rng(), rng());
    ridge.castShadow = true;
    ridge.receiveShadow = true;
    scene.add(ridge);
    addCollider(x, z, s * 0.6, s * 0.6);
  }

  // ── PATH rendering (dirt trail toward village) ───────────────
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const [x1, z1] = pathPoints[i];
    const [x2, z2] = pathPoints[i + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dx, dz);
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    const ty = getTerrainY(mx, mz);
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(2.5, len), M.path);
    seg.rotation.x = -Math.PI / 2;
    seg.rotation.z = -angle;
    seg.position.set(mx, ty + 0.05, mz);
    seg.receiveShadow = true;
    scene.add(seg);
  }

  // ── CAVE ────────────────────────────────────────────────────
  const cx = CAVE_POS.x, cz = CAVE_POS.z;
  const caveTY = getTerrainY(cx, cz);
  for (let i = 0; i < 8; i++) {
    const s = 2 + rng() * 2.5;
    const rx = cx - 2 + rng() * 4;
    const rz = cz - 3 + rng() * 2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), M.rockDark);
    rock.position.set(rx, caveTY + s * 0.6, rz);
    rock.rotation.set(rng(), rng(), rng());
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }
  const caveFloor = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  caveFloor.rotation.x = -Math.PI / 2;
  caveFloor.position.set(cx, caveTY + 0.05, cz + 1);
  scene.add(caveFloor);
  b(7, 0.8, 6, M.rockDark, cx, caveTY + 3.5, cz - 1);
  addCollider(cx, cz - 3.5, 3.5, 1);

  // ── ABANDONED HOUSE ─────────────────────────────────────────
  const hx = HOUSE_POS.x, hz = HOUSE_POS.z;
  const houseTY = getTerrainY(hx, hz);
  b(6, 3, 0.15, M.wall, hx, houseTY + 1.5, hz - 3);
  b(6, 3, 0.15, M.wall, hx, houseTY + 1.5, hz + 3);
  b(0.15, 3, 6, M.wall, hx - 3, houseTY + 1.5, hz);
  b(0.15, 3, 1.5, M.wall, hx + 3, houseTY + 1.5, hz - 2.25);
  b(0.15, 3, 1.5, M.wall, hx + 3, houseTY + 1.5, hz + 2.25);
  b(0.15, 0.8, 3, M.wall, hx + 3, houseTY + 2.6, hz);
  b(6, 0.12, 6, M.woodOld, hx, houseTY - 0.06, hz);
  b(6.5, 0.15, 3.5, M.roof, hx, houseTY + 3.6, hz - 1.2, 0.3, 0, 0);
  b(6.5, 0.15, 3.5, M.roof, hx, houseTY + 3.6, hz + 1.2, -0.3, 0, 0);
  b(5.5, 0.2, 0.2, M.woodOld, hx, houseTY + 1.2, hz + 1, 0, 0, 0.15);
  b(0.8, 0.8, 0.05, new THREE.MeshLambertMaterial({ color: 0x334455, transparent: true, opacity: 0.25 }), hx - 3, houseTY + 1.8, hz);
  addCollider(hx, hz - 3, 3, 0.15);
  addCollider(hx, hz + 3, 3, 0.15);
  addCollider(hx - 3, hz, 0.15, 3);
  addCollider(hx + 3, hz - 2.25, 0.15, 0.75);
  addCollider(hx + 3, hz + 2.25, 0.15, 0.75);

  // ── DIY SHELTER CLEARING ────────────────────────────────────
  const dx2 = DIY_POS.x, dz2 = DIY_POS.z;
  const diyTY = getTerrainY(dx2, dz2);
  const clearingFloor = new THREE.Mesh(new THREE.CircleGeometry(4, 16), M.path);
  clearingFloor.rotation.x = -Math.PI / 2;
  clearingFloor.position.set(dx2, diyTY + 0.05, dz2);
  clearingFloor.receiveShadow = true;
  scene.add(clearingFloor);
  b(2, 0.3, 0.3, M.trunk, dx2 - 2, diyTY + 0.15, dz2 + 2, 0, 0.3, 0);
  b(1.5, 0.25, 0.25, M.trunk, dx2 + 1.5, diyTY + 0.12, dz2 - 1.5, 0, -0.5, 0);

  // DIY shelter (built pieces — appear when constructed)
  const diyShelterParts = [];
  function buildDIYShelter() {
    const ty = getTerrainY(dx2, dz2);
    const p1 = b(3, 0.15, 0.15, M.wood, dx2, ty + 1.8, dz2 - 1.5);
    const p2 = b(3.5, 0.1, 0.1, M.stick, dx2 - 1, ty + 1.0, dz2, 0.6, 0, 0);
    const p3 = b(3.5, 0.1, 0.1, M.stick, dx2, ty + 1.0, dz2, 0.6, 0, 0);
    const p4 = b(3.5, 0.1, 0.1, M.stick, dx2 + 1, ty + 1.0, dz2, 0.6, 0, 0);
    const p5 = b(3.2, 0.05, 2.5, M.leaves, dx2, ty + 1.1, dz2 - 0.3, 0.5, 0, 0);
    diyShelterParts.push(p1, p2, p3, p4, p5);
    diyShelterParts.forEach(p => p.visible = false);
  }
  buildDIYShelter();

  // ── VILLAGE ─────────────────────────────────────────────────
  const vx = VILLAGE_POS.x, vz = VILLAGE_POS.z;
  const villageTY = getTerrainY(vx, vz);
  for (let i = 0; i < 5; i++) {
    const ox = (rng() - 0.5) * 20;
    const oz = (rng() - 0.5) * 20;
    const bty = getTerrainY(vx + ox, vz + oz);
    const sw = 3 + rng() * 2, sd = 3 + rng() * 2, sh = 2.5 + rng();
    b(sw, sh, 0.15, M.villageWall, vx + ox, bty + sh / 2, vz + oz - sd / 2);
    b(sw, sh, 0.15, M.villageWall, vx + ox, bty + sh / 2, vz + oz + sd / 2);
    b(0.15, sh, sd, M.villageWall, vx + ox - sw / 2, bty + sh / 2, vz + oz);
    b(0.15, sh, sd, M.villageWall, vx + ox + sw / 2, bty + sh / 2, vz + oz);
    b(sw + 0.4, 0.15, sd + 0.6, M.villageRoof, vx + ox, bty + sh + 0.1, vz + oz);
    b(0.6, 0.5, 0.05, M.window, vx + ox, bty + sh * 0.6, vz + oz - sd / 2 - 0.05);
    const wl = new THREE.PointLight(0xffaa44, 0.8, 8);
    wl.position.set(vx + ox, bty + sh * 0.6, vz + oz - sd / 2 + 0.5);
    scene.add(wl);
    addCollider(vx + ox, vz + oz, sw / 2 + 0.2, sd / 2 + 0.2);
  }
  b(0.15, 6, 0.15, M.trunk, vx, villageTY + 3, vz);
  const lanternMesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffcc44 }));
  lanternMesh.position.set(vx, villageTY + 6.5, vz);
  scene.add(lanternMesh);
  villageBeacon.position.set(vx, villageTY + 8, vz);

  // ── COLLECTIBLE ITEMS ───────────────────────────────────────
  stickPositions.forEach((pos, i) => {
    const ty = getTerrainY(pos.x, pos.z);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.2, 5), M.stick);
    mesh.position.set(pos.x, ty + 0.6, pos.z);
    mesh.rotation.z = 0.3 + rng() * 0.5;
    mesh.rotation.y = rng() * Math.PI;
    mesh.castShadow = true;
    scene.add(mesh);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 16), new THREE.MeshBasicMaterial({ color: 0xffaa33 }));
    ring.position.set(pos.x, ty + 0.8, pos.z);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    stickMeshes.push({ mesh, ring, index: i });
  });

  rockPositions.forEach((pos, i) => {
    const ty = getTerrainY(pos.x, pos.z);
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), M.rockItem);
    mesh.position.set(pos.x, ty + 0.2, pos.z);
    mesh.castShadow = true;
    scene.add(mesh);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 6, 16), new THREE.MeshBasicMaterial({ color: 0x88aaff }));
    ring.position.set(pos.x, ty + 0.4, pos.z);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    rockMeshes.push({ mesh, ring, index: i });
  });

  // ── CAMPFIRE (for cave/house/diy) ───────────────────────────
  let campfirePos = new THREE.Vector3(0, 0, 0);
  const campfireParticles = [];
  const fireGeo = new THREE.SphereGeometry(0.06, 5, 5);
  const fireColors = [0xff2200, 0xff4400, 0xff6600, 0xffaa00, 0xffcc00];
  for (let i = 0; i < 60; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: fireColors[Math.floor(rng() * 5)], transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(fireGeo, mat);
    mesh.visible = false;
    mesh.userData = { life: 0, maxLife: 0, vx: 0, vy: 0, vz: 0 };
    scene.add(mesh);
    campfireParticles.push(mesh);
  }

  function spawnCampfireParticle() {
    const p = campfireParticles.find(fp => !fp.visible);
    if (!p) return;
    p.position.set(
      campfirePos.x + (rng() - 0.5) * 0.4,
      campfirePos.y + 0.1,
      campfirePos.z + (rng() - 0.5) * 0.4
    );
    p.userData.vx = (rng() - 0.5) * 0.3;
    p.userData.vy = 1.2 + rng() * 1.5;
    p.userData.vz = (rng() - 0.5) * 0.3;
    p.userData.life = 0;
    p.userData.maxLife = 0.3 + rng() * 0.5;
    p.visible = true;
    p.material.color.setHex(fireColors[Math.floor(rng() * 5)]);
    const s = 0.5 + rng() * 1.5;
    p.scale.setScalar(s);
  }

  function updateCampfireParticles(dt) {
    for (const p of campfireParticles) {
      if (!p.visible) continue;
      p.userData.life += dt;
      if (p.userData.life >= p.userData.maxLife) { p.visible = false; continue; }
      const t = p.userData.life / p.userData.maxLife;
      p.position.x += p.userData.vx * dt;
      p.position.y += p.userData.vy * dt;
      p.position.z += p.userData.vz * dt;
      p.material.opacity = (1 - t) * 0.8;
      if (t > 0.6) p.material.color.setHex(0x441100);
    }
  }

  // ── CONTROLS ────────────────────────────────────────────────
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
      if (!sounds.wind.isPlaying) sounds.wind.play();
    }
  });

  document.addEventListener("pointerlockchange", () => {
    isLocked = document.pointerLockElement === canvas;
    const hint = document.getElementById("game-hint");
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
      if (isPaused) { canvas.requestPointerLock(); }
    }
  }, true);

  let mouseSens = 0.8;

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
  const SPRINT_SPEED = 6.5;
  const P_RAD = 0.3;
  const fwd = new THREE.Vector3(), rgt2 = new THREE.Vector3(), mdir = new THREE.Vector3();

  function resolveColliders(px, pz) {
    for (const c of colliders) {
      const nearX = Math.max(c.minX, Math.min(c.maxX, px));
      const nearZ = Math.max(c.minZ, Math.min(c.maxZ, pz));
      const ddx = px - nearX, ddz = pz - nearZ;
      const dist = Math.sqrt(ddx * ddx + ddz * ddz);
      if (dist < P_RAD && dist > 0) {
        const push = (P_RAD - dist) / dist;
        px += ddx * push; pz += ddz * push;
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
    rgt2.crossVectors(fwd, camera.up).normalize();
    mdir.set(0, 0, 0);
    if (keys["KeyW"] || keys["ArrowUp"]) mdir.add(fwd);
    if (keys["KeyS"] || keys["ArrowDown"]) mdir.sub(fwd);
    if (keys["KeyA"] || keys["ArrowLeft"]) mdir.sub(rgt2);
    if (keys["KeyD"] || keys["ArrowRight"]) mdir.add(rgt2);

    const isMoving = mdir.lengthSq() > 0;
    isSprinting = keys["Shift"] && isMoving && !isCrouching && stamina > 0;
    if (isSprinting) stamina = Math.max(0, stamina - 20 * dt);
    else stamina = Math.min(100, stamina + 12 * dt);

    const spd = (isSprinting ? SPRINT_SPEED : WALK_SPEED) * (isCrouching ? 0.5 : 1) * dt;
    if (isMoving) {
      mdir.normalize().multiplyScalar(spd);
      let nx = camera.position.x + mdir.x, nz = camera.position.z;
      let r = resolveColliders(nx, nz); nx = r.px; nz = r.pz;
      nz += mdir.z;
      r = resolveColliders(nx, nz); nx = r.px; nz = r.pz;
      camera.position.x = Math.max(-95, Math.min(95, nx));
      camera.position.z = Math.max(-95, Math.min(95, nz));
    }
    const ty = getTerrainY(camera.position.x, camera.position.z);
    camera.position.y = ty + currentEyeY;
  }

  // ── Interaction checks ──────────────────────────────────────
  function checkInteractions() {
    const p = camera.position;
    interactPrompt = '';
    canInteract = false;
    interactType = '';
    interactTarget = null;

    if (gameState === STATE.DONE) return;

    // Sticks
    for (const s of stickMeshes) {
      if (collectedSticks.has(s.index)) continue;
      if (p.distanceTo(stickPositions[s.index]) < 2.5) {
        interactPrompt = `Press [E] to pick up stick (${hasSticks}/3)`;
        canInteract = true; interactType = 'stick'; interactTarget = s;
        return;
      }
    }
    // Rocks
    for (const r of rockMeshes) {
      if (collectedRocks.has(r.index)) continue;
      if (p.distanceTo(rockPositions[r.index]) < 2.5) {
        interactPrompt = `Press [E] to pick up rock (${hasRocks}/2)`;
        canInteract = true; interactType = 'rock'; interactTarget = r;
        return;
      }
    }

    // Village entrance
    if (p.distanceTo(VILLAGE_POS) < 12) {
      interactPrompt = 'Press [E] to enter the village — SAFETY!';
      canInteract = true; interactType = 'village';
      return;
    }

    // Cave shelter
    if (p.distanceTo(CAVE_POS) < 5) {
      if (!inShelter) {
        interactPrompt = 'Press [E] to take shelter in cave';
        canInteract = true; interactType = 'shelter_cave';
      } else if (inShelter && shelterType === 'cave' && !fireLit && hasSticks >= 3 && hasRocks >= 2) {
        interactPrompt = `Press [E] to make fire (hold E) [${Math.round(fireProgress)}%]`;
        canInteract = true; interactType = 'makefire';
      } else if (inShelter && shelterType === 'cave' && !fireLit) {
        interactPrompt = `Need 3 sticks (${hasSticks}/3) and 2 rocks (${hasRocks}/2) for fire`;
      }
      return;
    }

    // House shelter
    const hDist = Math.sqrt(Math.pow(p.x - HOUSE_POS.x, 2) + Math.pow(p.z - HOUSE_POS.z, 2));
    if (hDist < 4) {
      if (!inShelter) {
        interactPrompt = 'Press [E] to shelter in abandoned house';
        canInteract = true; interactType = 'shelter_house';
      } else if (inShelter && shelterType === 'house' && !fireLit && hasSticks >= 3 && hasRocks >= 2) {
        interactPrompt = `Press [E] to make fire (hold E) [${Math.round(fireProgress)}%]`;
        canInteract = true; interactType = 'makefire';
      } else if (inShelter && shelterType === 'house' && !fireLit) {
        interactPrompt = `Need 3 sticks (${hasSticks}/3) and 2 rocks (${hasRocks}/2) for fire`;
      }
      return;
    }

    // DIY shelter spot
    if (p.distanceTo(DIY_POS) < 5) {
      if (!inShelter && hasSticks >= 3) {
        interactPrompt = 'Press [E] to build a lean-to shelter';
        canInteract = true; interactType = 'shelter_diy';
      } else if (!inShelter && hasSticks < 3) {
        interactPrompt = `Need at least 3 sticks to build shelter (${hasSticks}/3)`;
      } else if (inShelter && shelterType === 'diy' && !fireLit && hasRocks >= 2) {
        interactPrompt = `Press [E] to make fire [${Math.round(fireProgress)}%]`;
        canInteract = true; interactType = 'makefire';
      } else if (inShelter && shelterType === 'diy' && !fireLit) {
        interactPrompt = `Need 2 rocks for fire (${hasRocks}/2)`;
      }
      return;
    }
  }

  function doInteract() {
    if (!canInteract) return;

    if (interactType === 'stick') {
      collectedSticks.add(interactTarget.index);
      interactTarget.mesh.visible = false;
      interactTarget.ring.visible = false;
      hasSticks++;
      if (!sounds.snap.isPlaying) sounds.snap.play();
      return;
    }
    if (interactType === 'rock') {
      collectedRocks.add(interactTarget.index);
      interactTarget.mesh.visible = false;
      interactTarget.ring.visible = false;
      hasRocks++;
      if (!sounds.snap.isPlaying) sounds.snap.play();
      return;
    }
    if (interactType === 'village') {
      foundShelter = true; shelterType = 'village'; inShelter = true; fireLit = true;
      showOutcome();
      return;
    }
    if (interactType === 'shelter_cave') {
      inShelter = true; shelterType = 'cave';
      campfirePos.set(CAVE_POS.x, 0.1, CAVE_POS.z + 2);
      campfireLight.position.copy(campfirePos).add(new THREE.Vector3(0, 0.5, 0));
      return;
    }
    if (interactType === 'shelter_house') {
      inShelter = true; shelterType = 'house';
      campfirePos.set(HOUSE_POS.x, 0.1, HOUSE_POS.z);
      campfireLight.position.copy(campfirePos).add(new THREE.Vector3(0, 0.5, 0));
      return;
    }
    if (interactType === 'shelter_diy') {
      inShelter = true; shelterType = 'diy';
      diyShelterParts.forEach(p => p.visible = true);
      campfirePos.set(DIY_POS.x + 1.5, 0.1, DIY_POS.z + 1);
      campfireLight.position.copy(campfirePos).add(new THREE.Vector3(0, 0.5, 0));
      return;
    }
    if (interactType === 'makefire') {
      fireProgress += 8;
      if (!sounds.snap.isPlaying) sounds.snap.play();
      if (fireProgress >= 100) {
        fireLit = true;
        if (sounds.fire.buffer && !sounds.fire.isPlaying) sounds.fire.play();
        sounds.fire.setVolume(0.6);
      }
      return;
    }
  }

  // ── Darkness / Temperature ──────────────────────────────────
  function updateEnvironment(dt) {
    const progress = gameTimer / GAME_DURATION;

    // Sky darkens from dusk to night
    const skyR = 0.23 * (1 - progress * 0.92);
    const skyG = 0.29 * (1 - progress * 0.88);
    const skyB = 0.35 * (1 - progress * 0.80);
    scene.background.setRGB(skyR, skyG, skyB);
    scene.fog.color.setRGB(skyR, skyG, skyB);

    // Fog closes in
    scene.fog.near = Math.max(5, 30 - progress * 25);
    scene.fog.far = Math.max(20, 120 - progress * 95);

    // Sun dims
    sunLight.intensity = Math.max(0, 0.55 - progress * 0.6);
    ambientLight.intensity = Math.max(0.03, 0.4 - progress * 0.38);
    hemiLight.intensity = Math.max(0.03, 0.4 - progress * 0.38);

    // Village beacon gets more prominent as it darkens
    villageBeacon.intensity = 3 + progress * 8;
    const bt = performance.now() * 0.001;
    lanternMesh.material.color.setHex(Math.sin(bt * 3) > 0.3 ? 0xffcc44 : 0xffaa22);

    // Temperature drops
    let warmthDrain = 3 + progress * 8;
    if (inShelter) warmthDrain *= 0.3;
    if (fireLit && inShelter) {
      warmth = Math.min(100, warmth + 15 * dt);
      warmthDrain = 0;
    }
    warmth = Math.max(0, warmth - warmthDrain * dt);

    // Warmth effects
    if (warmth < 30) {
      panic = Math.min(100, panic + 8 * dt);
      if (warmth < 15) health -= 5 * dt;
    }

    if (!inShelter && progress > 0.3) {
      panic = Math.min(100, panic + 3 * dt);
    }

    if (inShelter && fireLit) {
      panic = Math.max(0, panic - 15 * dt);
    } else if (inShelter) {
      panic = Math.max(10, panic - 5 * dt);
    }

    // Heartbeat
    if (panic > 65 && sounds.heartbeat.buffer && !sounds.heartbeat.isPlaying) sounds.heartbeat.play();
    else if (panic <= 65 && sounds.heartbeat.isPlaying) sounds.heartbeat.stop();
    if (sounds.heartbeat.isPlaying) sounds.heartbeat.setVolume((panic - 65) / 35);

    // Wind gets louder
    sounds.wind.setVolume(0.3 + progress * 0.7);

    // Campfire visuals
    if (fireLit && inShelter) {
      const fl = 0.8 + Math.sin(bt * 12) * 0.3 + Math.sin(bt * 23) * 0.15;
      campfireLight.intensity = 4 * fl;
      campfireLight.distance = 15;
      if (Math.random() < 0.4) spawnCampfireParticle();
    }
    updateCampfireParticles(dt);
  }

  // ── Animate collectible rings ───────────────────────────────
  function animateCollectibles(t) {
    for (const s of stickMeshes) {
      if (collectedSticks.has(s.index)) continue;
      s.ring.position.y = 0.8 + Math.sin(t * 3 + s.index) * 0.1;
      s.ring.rotation.z = t * 2;
    }
    for (const r of rockMeshes) {
      if (collectedRocks.has(r.index)) continue;
      r.ring.position.y = 0.4 + Math.sin(t * 3 + r.index + 2) * 0.1;
      r.ring.rotation.z = t * 2;
    }
  }

  // ── HUD ─────────────────────────────────────────────────────
  let healthFill, staminaFill, warmthFill, panicFill, timerEl, statusEl, promptEl, outcomeEl, itemEl;

  function buildHUD() {
    const wrapper = canvas.parentElement;

    const hint = document.createElement("div"); hint.id = "game-hint";
    hint.innerHTML = `<div class="gh-title">🌲 LOST IN THE WOODS</div><div class="gh-sub">Click anywhere to enter</div><div class="gh-keys"><span>WASD</span> Move &nbsp;·&nbsp;<span>Shift</span> Sprint &nbsp;·&nbsp;<span>Mouse</span> Look &nbsp;·&nbsp;<span>E</span> Interact &nbsp;·&nbsp;<span>Esc</span> Exit</div><div class="gh-warn">⚠ Night is falling. Find shelter before hypothermia sets in. Follow the distant light...</div>`;
    wrapper.appendChild(hint);

    const cross = document.createElement("div"); cross.id = "game-crosshair";
    cross.innerHTML = `<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="8" stroke="rgba(255,255,255,.75)" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="16" x2="12" y2="22" stroke="rgba(255,255,255,.75)" stroke-width="1.5" stroke-linecap="round"/><line x1="2" y1="12" x2="8" y2="12" stroke="rgba(255,255,255,.75)" stroke-width="1.5" stroke-linecap="round"/><line x1="16" y1="12" x2="22" y2="12" stroke="rgba(255,255,255,.75)" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="1.2" fill="rgba(255,255,255,.6)"/></svg>`;
    cross.style.display = "none"; wrapper.appendChild(cross);
    document.addEventListener("pointerlockchange", () => { cross.style.display = document.pointerLockElement === canvas ? "block" : "none"; });

    const hw = document.createElement("div"); hw.id = "health-wrap";
    hw.innerHTML = `<div id="health-label">HEALTH</div><div id="health-bar"><div id="health-fill"></div></div>`;
    wrapper.appendChild(hw); healthFill = document.getElementById("health-fill");

    const sw = document.createElement("div"); sw.id = "stamina-wrap";
    sw.innerHTML = `<div id="stamina-label">STAMINA</div><div id="stamina-bar"><div id="stamina-fill"></div></div>`;
    wrapper.appendChild(sw); staminaFill = document.getElementById("stamina-fill");

    const ow = document.createElement("div"); ow.id = "oxygen-wrap";
    ow.innerHTML = `<div id="oxygen-label">WARMTH</div><div id="oxygen-bar"><div id="oxygen-fill"></div></div>`;
    wrapper.appendChild(ow); warmthFill = document.getElementById("oxygen-fill");

    const pw = document.createElement("div"); pw.id = "panic-wrap";
    pw.innerHTML = `<div id="panic-label">PANIC</div><div id="panic-bar"><div id="panic-fill"></div></div>`;
    wrapper.appendChild(pw); panicFill = document.getElementById("panic-fill");

    timerEl = document.createElement("div"); timerEl.id = "game-timer"; wrapper.appendChild(timerEl);
    statusEl = document.createElement("div"); statusEl.id = "game-status"; wrapper.appendChild(statusEl);

    promptEl = document.createElement("div"); promptEl.id = "interact-prompt";
    promptEl.style.cssText = `position:absolute;bottom:130px;left:50%;transform:translateX(-50%);font-family:var(--font-cond,'Barlow Condensed',sans-serif);font-size:1.2rem;font-weight:700;letter-spacing:0.06em;color:#fff;background:rgba(0,0,0,0.75);border:2px solid rgba(255,255,255,0.3);padding:10px 24px;border-radius:8px;pointer-events:none;z-index:25;display:none;text-align:center;text-shadow:0 1px 4px rgba(0,0,0,0.9);box-shadow:0 4px 16px rgba(0,0,0,0.4);`;
    wrapper.appendChild(promptEl);

    itemEl = document.createElement("div"); itemEl.id = "item-indicator";
    itemEl.style.cssText = `position:absolute;top:188px;left:20px;font-family:var(--font-cond,'Barlow Condensed',sans-serif);font-size:0.95rem;font-weight:700;letter-spacing:0.08em;color:#e8e0d0;background:rgba(0,0,0,0.65);border:2px solid rgba(255,255,255,0.18);padding:8px 16px;border-radius:6px;pointer-events:none;z-index:20;white-space:pre-line;text-shadow:0 1px 3px rgba(0,0,0,0.8);box-shadow:0 2px 8px rgba(0,0,0,0.3);`;
    wrapper.appendChild(itemEl);

    outcomeEl = document.createElement("div"); outcomeEl.id = "outcome-screen"; outcomeEl.style.display = "none"; wrapper.appendChild(outcomeEl);

    // Pause menu
    const pauseMenu = document.createElement("div");
    pauseMenu.id = "pause-menu";
    pauseMenu.style.cssText = `position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);z-index:70;pointer-events:auto;`;
    pauseMenu.innerHTML = `
      <div style="background:rgba(12,14,12,0.97);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:40px 52px;min-width:340px;display:flex;flex-direction:column;align-items:center;gap:24px;">
        <div style="font-family:'Oswald',sans-serif;font-size:1.8rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#f0ece4;">PAUSED</div>
        <div style="width:100%;border-top:1px solid rgba(255,255,255,0.08);"></div>
        <div style="width:100%;display:flex;flex-direction:column;gap:14px;">
          <div style="font-family:'Share Tech Mono',monospace;font-size:0.65rem;letter-spacing:0.25em;color:rgba(255,255,255,0.4);text-transform:uppercase;">Settings</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:600;letter-spacing:0.06em;color:#d1c9bb;">Mouse Sensitivity</span>
              <span id="pause-sens-value" style="font-family:'Share Tech Mono',monospace;font-size:0.85rem;color:#fbbf24;min-width:30px;text-align:right;">0.8</span>
            </div>
            <input id="pause-sens-slider" type="range" min="10" max="200" value="80" style="width:100%;accent-color:#fbbf24;cursor:pointer;height:6px;">
            <div style="display:flex;justify-content:space-between;font-family:'Share Tech Mono',monospace;font-size:0.6rem;color:rgba(255,255,255,0.25);"><span>LOW</span><span>HIGH</span></div>
          </div>
        </div>
        <div style="width:100%;border-top:1px solid rgba(255,255,255,0.08);"></div>
        <button id="pause-resume-btn" style="font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#fff;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.25);border-radius:6px;padding:12px 40px;cursor:pointer;width:100%;transition:background 0.2s,border-color 0.2s;">Resume</button>
        <div style="font-family:'Share Tech Mono',monospace;font-size:0.65rem;color:rgba(255,255,255,0.25);letter-spacing:0.1em;">Press ESC or click Resume to continue</div>
      </div>`;
    wrapper.appendChild(pauseMenu);
    document.getElementById("pause-sens-slider").addEventListener("input", e => {
      mouseSens = parseInt(e.target.value) / 100;
      document.getElementById("pause-sens-value").textContent = mouseSens.toFixed(1);
    });
    const resumeBtn = document.getElementById("pause-resume-btn");
    resumeBtn.addEventListener("mouseenter", () => { resumeBtn.style.background = "rgba(255,255,255,0.16)"; resumeBtn.style.borderColor = "rgba(255,255,255,0.4)"; });
    resumeBtn.addEventListener("mouseleave", () => { resumeBtn.style.background = "rgba(255,255,255,0.08)"; resumeBtn.style.borderColor = "rgba(255,255,255,0.25)"; });
    resumeBtn.addEventListener("click", () => { canvas.requestPointerLock(); });
  }

  function updateHUD() {
    if (!panicFill) return;

    staminaFill.style.width = stamina + "%";
    staminaFill.style.backgroundColor = stamina < 25 ? "#f87171" : "#38bdf8";

    const p = panic / 100;
    panicFill.style.width = panic + "%";
    panicFill.style.background = `rgb(${Math.round(p * 210)},${Math.round((1 - p) * 170 + 20)},20)`;

    const h = health / 100;
    healthFill.style.width = Math.max(0, health) + "%";
    healthFill.style.background = `rgb(${Math.round((1 - h) * 210)},${Math.round(h * 170 + 20)},20)`;

    warmthFill.style.width = warmth + "%";
    if (warmth < 25) warmthFill.style.background = '#3b82f6';
    else if (warmth < 50) warmthFill.style.background = '#60a5fa';
    else warmthFill.style.background = '#f97316';

    // Timer
    const rem = Math.ceil(GAME_DURATION - gameTimer);
    timerEl.textContent = `NIGHTFALL: ${Math.floor(rem / 60)}:${(rem % 60).toString().padStart(2, '0')}`;
    timerEl.style.color = rem < 30 ? '#ef4444' : '#fbbf24';

    // Items
    itemEl.textContent = `🪵 Sticks: ${hasSticks}/3  |  🪨 Rocks: ${hasRocks}/2${inShelter ? '\n🏕 Sheltered' : ''}${fireLit ? '\n🔥 Fire lit!' : ''}`;

    // Prompt
    if (promptEl) {
      if (interactPrompt) { promptEl.style.display = "block"; promptEl.textContent = interactPrompt; }
      else { promptEl.style.display = "none"; }
    }

    // Status
    const progress = gameTimer / GAME_DURATION;
    if (fireLit && inShelter) {
      statusEl.textContent = "✓ Safe and warm. You'll survive the night.";
      statusEl.style.color = "#4ade80";
    } else if (inShelter && !fireLit) {
      statusEl.textContent = "⚠ You're sheltered but freezing. Make a fire!";
      statusEl.style.color = "#fbbf24";
    } else if (progress < 0.2) {
      statusEl.textContent = "The sun is setting. Find shelter before dark...";
      statusEl.style.color = "#d1c9bb";
    } else if (progress < 0.5) {
      statusEl.textContent = "⚠ Getting darker. Follow the distant light or find shelter nearby.";
      statusEl.style.color = "#fbbf24";
    } else if (progress < 0.8) {
      statusEl.textContent = "⚠ It's getting dangerously cold. Find shelter NOW!";
      statusEl.style.color = "#f97316";
    } else {
      statusEl.textContent = "⚠ HYPOTHERMIA SETTING IN! You need shelter and warmth!";
      statusEl.style.color = "#ef4444";
    }
  }

  // ── OUTCOME ─────────────────────────────────────────────────
  function showOutcome() {
    gameState = STATE.DONE;
    document.exitPointerLock();
    if (sounds.wind.isPlaying) sounds.wind.stop();
    if (sounds.heartbeat.isPlaying) sounds.heartbeat.stop();
    const hint = document.getElementById("game-hint");
    if (hint) hint.style.display = "none";

    let title, body, warmthResult, accent;

    if (health <= 0) {
      title = "HYPOTHERMIA";
      body = "The cold took you before you could find shelter. In survival situations, shelter is your #1 priority — even before food or water.";
      warmthResult = "Warmth: CRITICAL"; accent = "#ef4444";
    } else if (shelterType === 'village') {
      title = "RESCUED — VILLAGE FOUND";
      body = "You followed the distant light and found civilization. Excellent navigation. Always look for light sources at night — they mean people.";
      warmthResult = `Warmth: ${Math.round(warmth)}%`; accent = "#4ade80";
    } else if (fireLit && inShelter) {
      title = "SURVIVED — FIRE & SHELTER";
      body = `You found ${shelterType === 'cave' ? 'a cave' : shelterType === 'house' ? 'an abandoned house' : 'materials for a lean-to'}, built a fire, and kept warm through the night. Textbook survival.`;
      warmthResult = `Warmth: ${Math.round(warmth)}%`; accent = "#4ade80";
    } else if (inShelter && !fireLit) {
      title = "SURVIVED — BARELY";
      body = "You found shelter but couldn't make a fire. The cold nearly got you. Remember: fire = life in cold survival.";
      warmthResult = `Warmth: ${Math.round(warmth)}%`; accent = "#f97316";
    } else {
      title = "TIME'S UP — EXPOSED";
      body = "Night fell with no shelter. Exposure to the elements is lethal. The #1 rule: get out of the cold.";
      warmthResult = "Warmth: DEPLETED"; accent = "#ef4444";
    }

    outcomeEl.style.display = "flex";
    outcomeEl.innerHTML = `
      <div class="outcome-box">
        <div class="outcome-badge" style="background:${accent}22;border-color:${accent}55">SCENARIO COMPLETE</div>
        <div class="outcome-title" style="color:${accent}">${title}</div>
        <div class="outcome-body">${body}</div>
        <div class="outcome-stats">
          <div class="outcome-stat" style="color:${accent}">${warmthResult}</div>
          <div class="outcome-stat">Health: <strong>${Math.max(0, Math.round(health))}%</strong></div>
          <div class="outcome-stat">Panic: <strong>${Math.round(panic)}%</strong></div>
          <div class="outcome-stat">Shelter: <strong>${shelterType || 'None'}</strong> | Fire: <strong>${fireLit ? 'Yes' : 'No'}</strong></div>
        </div>
        <button class="outcome-btn" onclick="location.reload()">↩ Try Again</button>
        <button class="menu-btn" onclick="backToMenu()">← Back to Menu</button>
      </div>
    `;
  }

  // ── INIT & LOOP ─────────────────────────────────────────────
  buildHUD();

  window.addEventListener("resize", () => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  });

  let lastTime = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);
    if (gameState === STATE.DONE) { renderer.render(scene, camera); return; }

    if (isPaused) { lastTime = now; renderer.render(scene, camera); return; }

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const t = now * 0.001;

    gameTimer += dt;
    updateMovement(dt);
    checkInteractions();
    updateEnvironment(dt);
    animateCollectibles(t);

    // Auto-end conditions
    if (health <= 0 || (gameTimer >= GAME_DURATION && !inShelter)) {
      showOutcome(); return;
    }
    // Win condition: sheltered with fire, or in village
    if (inShelter && fireLit && gameTimer > 10) {
      // Let them enjoy it for a moment, then end
      if (gameTimer > GAME_DURATION * 0.5 || shelterType === 'village') {
        showOutcome(); return;
      }
    }

    updateHUD();
    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
})();