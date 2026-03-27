// ============================================================
//  game.js  –  Survival Encyclopedia  |  3D World
//  Player can move with WASD / Arrow Keys + Mouse Look
//  Click the canvas to lock the pointer (FPS-style controls)
// ============================================================

(function () {
  "use strict";

  // ── Guard: only run when the canvas exists ──────────────────
  const canvas = document.getElementById("game-canvas");
  if (!canvas) return;

  // ── Scene, Camera, Renderer ─────────────────────────────────
  const scene    = new THREE.Scene();
  const camera   = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Dark, foggy survival atmosphere
  scene.background = new THREE.Color(0x0d1a0f);
  scene.fog        = new THREE.FogExp2(0x0d1a0f, 0.04);

  // ── Lighting ────────────────────────────────────────────────
  // Moonlight (dim blue-white directional)
  const moonLight        = new THREE.DirectionalLight(0x8ab4c9, 0.4);
  moonLight.position.set(50, 80, 30);
  moonLight.castShadow   = true;
  moonLight.shadow.mapSize.width  = 2048;
  moonLight.shadow.mapSize.height = 2048;
  moonLight.shadow.camera.near    = 1;
  moonLight.shadow.camera.far     = 200;
  moonLight.shadow.camera.left    = -80;
  moonLight.shadow.camera.right   =  80;
  moonLight.shadow.camera.top     =  80;
  moonLight.shadow.camera.bottom  = -80;
  scene.add(moonLight);

  // Ambient (very dark green-tinted)
  scene.add(new THREE.AmbientLight(0x112211, 0.6));

  // Campfire point light (warm orange glow)
  const fireLight = new THREE.PointLight(0xff6a1a, 3, 18);
  fireLight.position.set(0, 1.5, -8);
  fireLight.castShadow = true;
  scene.add(fireLight);

  // Second fill light so fire illuminates surroundings
  const fireFill = new THREE.PointLight(0xff4400, 1.2, 30);
  fireFill.position.set(0, 0.5, -8);
  scene.add(fireFill);

  // ── Ground ──────────────────────────────────────────────────
  function makeGround() {
    const geo = new THREE.PlaneGeometry(200, 200, 60, 60);
    // Slightly displace vertices for uneven dirt look
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      // Exclude the area right around the campfire (keep it flat)
      const dist = Math.sqrt(x * x + (z + 8) * (z + 8));
      if (dist > 5) {
        pos.setY(i, (Math.random() - 0.5) * 0.4 +
          Math.sin(x * 0.3) * 0.15 + Math.cos(z * 0.25) * 0.15);
      }
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ color: 0x1a2e12 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Dirt patches
    for (let i = 0; i < 30; i++) {
      const pg  = new THREE.CircleGeometry(Math.random() * 2 + 0.5, 8);
      const pm  = new THREE.MeshLambertMaterial({ color: 0x2a1f0e });
      const patch = new THREE.Mesh(pg, pm);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(
        (Math.random() - 0.5) * 180,
        0.01,
        (Math.random() - 0.5) * 180
      );
      scene.add(patch);
    }
  }
  makeGround();

  // ── Trees ───────────────────────────────────────────────────
  function makeTree(x, z) {
    const group = new THREE.Group();

    // Trunk
    const trunkH  = 3 + Math.random() * 3;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, trunkH, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x3b2510 });
    const trunk    = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    group.add(trunk);

    // Foliage layers (2-3 cones)
    const layers = 2 + Math.floor(Math.random() * 2);
    const foliageMat = new THREE.MeshLambertMaterial({ color: 0x1a3d0e });
    for (let i = 0; i < layers; i++) {
      const r   = 1.5 - i * 0.3 + Math.random() * 0.3;
      const h   = 2.5 - i * 0.2;
      const geo = new THREE.ConeGeometry(r, h, 7);
      const mesh = new THREE.Mesh(geo, foliageMat);
      mesh.position.y = trunkH + i * (h * 0.55);
      mesh.rotation.y = Math.random() * Math.PI;
      mesh.castShadow = true;
      group.add(mesh);
    }

    group.position.set(x, 0, z);
    group.rotation.y = Math.random() * Math.PI * 2;
    const s = 0.8 + Math.random() * 0.5;
    group.scale.set(s, s, s);
    scene.add(group);
  }

  // Dense forest ring, open centre for campfire
  function plantForest() {
    const positions = [];
    for (let i = 0; i < 120; i++) {
      const angle  = Math.random() * Math.PI * 2;
      const radius = 14 + Math.random() * 80;
      positions.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
    positions.forEach(([x, z]) => makeTree(x, z));
  }
  plantForest();

  // ── Rocks ───────────────────────────────────────────────────
  function makeRock(x, z, scale) {
    const geo  = new THREE.DodecahedronGeometry(scale, 0);
    const mat  = new THREE.MeshLambertMaterial({ color: 0x3d3d3d });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, scale * 0.5, z);
    mesh.rotation.set(Math.random(), Math.random(), Math.random());
    mesh.castShadow  = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 60;
    makeRock(Math.cos(a) * r, Math.sin(a) * r, 0.2 + Math.random() * 0.9);
  }

  // ── Campfire ────────────────────────────────────────────────
  function makeCampfire() {
    const cx = 0, cz = -8;

    // Stone ring
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    for (let i = 0; i < 8; i++) {
      const a   = (i / 8) * Math.PI * 2;
      const geo = new THREE.SphereGeometry(0.25, 5, 5);
      const m   = new THREE.Mesh(geo, stoneMat);
      m.position.set(cx + Math.cos(a) * 0.9, 0.15, cz + Math.sin(a) * 0.9);
      m.castShadow = true;
      scene.add(m);
    }

    // Logs
    const logMat = new THREE.MeshLambertMaterial({ color: 0x3b2510 });
    for (let i = 0; i < 3; i++) {
      const a   = (i / 3) * Math.PI * 2;
      const geo = new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6);
      const m   = new THREE.Mesh(geo, logMat);
      m.position.set(cx + Math.cos(a) * 0.4, 0.08, cz + Math.sin(a) * 0.4);
      m.rotation.z = Math.PI / 2;
      m.rotation.y = a;
      scene.add(m);
    }

    // Flame particles (simple cone stack)
    const flames = [];
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
    for (let i = 0; i < 5; i++) {
      const h   = 0.3 + Math.random() * 0.4;
      const geo = new THREE.ConeGeometry(0.08 + Math.random() * 0.08, h, 5);
      const m   = new THREE.Mesh(geo, flameMat.clone());
      m.position.set(
        cx + (Math.random() - 0.5) * 0.3,
        0.3 + i * 0.18,
        cz + (Math.random() - 0.5) * 0.3
      );
      m._baseY   = m.position.y;
      m._phase   = Math.random() * Math.PI * 2;
      m._speed   = 2 + Math.random() * 2;
      flames.push(m);
      scene.add(m);
    }
    return flames;
  }
  const flames = makeCampfire();

  // ── Shelter (lean-to) ────────────────────────────────────────
  function makeShelter() {
    const sx = 10, sz = -5;

    // Two support poles
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3b2510 });
    [-0.8, 0.8].forEach(offset => {
      const geo = new THREE.CylinderGeometry(0.06, 0.08, 2.5, 5);
      const m   = new THREE.Mesh(geo, poleMat);
      m.position.set(sx + offset, 1.25, sz);
      m.castShadow = true;
      scene.add(m);
    });

    // Ridge pole
    const ridgeGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5);
    const ridge    = new THREE.Mesh(ridgeGeo, poleMat);
    ridge.rotation.z = Math.PI / 2;
    ridge.position.set(sx, 2.5, sz);
    scene.add(ridge);

    // Roof panels (two slanted planes)
    const roofMat = new THREE.MeshLambertMaterial({
      color: 0x2a4a1a, side: THREE.DoubleSide
    });
    [-1, 1].forEach(side => {
      const geo = new THREE.PlaneGeometry(1.8, 2.2);
      const m   = new THREE.Mesh(geo, roofMat);
      m.position.set(sx, 1.6, sz + side * 1.1);
      m.rotation.x = -side * Math.PI * 0.3;
      m.castShadow    = true;
      m.receiveShadow = true;
      scene.add(m);
    });
  }
  makeShelter();

  // ── Stars ───────────────────────────────────────────────────
  function makeStars() {
    const geo = new THREE.BufferGeometry();
    const verts = [];
    for (let i = 0; i < 2000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 400 + Math.random() * 100;
      verts.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    const mat   = new THREE.PointsMaterial({ color: 0xffffff, size: 0.6 });
    scene.add(new THREE.Points(geo, mat));
  }
  makeStars();

  // ── Moon ────────────────────────────────────────────────────
  function makeMoon() {
    const geo  = new THREE.SphereGeometry(8, 16, 16);
    const mat  = new THREE.MeshBasicMaterial({ color: 0xd4e8f5 });
    const moon = new THREE.Mesh(geo, mat);
    moon.position.set(120, 150, -200);
    scene.add(moon);
  }
  makeMoon();

  // ── Camera / Player setup ───────────────────────────────────
  camera.position.set(0, 1.7, 5);
  camera.rotation.order = "YXZ";   // yaw first, then pitch

  // ── Pointer Lock (FPS mouse look) ───────────────────────────
  const euler    = new THREE.Euler(0, 0, 0, "YXZ");
  let isLocked   = false;
  const PITCH_MAX = Math.PI / 2.2;

  canvas.addEventListener("click", () => {
    canvas.requestPointerLock();
  });

  document.addEventListener("pointerlockchange", () => {
    isLocked = document.pointerLockElement === canvas;
    const hint = document.getElementById("game-hint");
    if (hint) hint.style.display = isLocked ? "none" : "flex";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isLocked) return;
    const sens = 0.002;
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= e.movementX * sens;
    euler.x -= e.movementY * sens;
    euler.x  = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, euler.x));
    camera.quaternion.setFromEuler(euler);
  });

  // ── Keyboard ────────────────────────────────────────────────
  const keys = {};
  document.addEventListener("keydown", e => { keys[e.code] = true; });
  document.addEventListener("keyup",   e => { keys[e.code] = false; });

  // ── Movement ────────────────────────────────────────────────
  const SPEED      = 5;      // units / second
  const SPRINT_MUL = 2;
  const GRAVITY    = -12;
  const JUMP_VEL   = 5;

  let velocityY     = 0;
  let isOnGround    = true;
  const playerPos   = camera.position;

  const forward  = new THREE.Vector3();
  const right    = new THREE.Vector3();
  const moveDir  = new THREE.Vector3();

  function updateMovement(dt) {
    // ---- horizontal ----
    const sprint  = keys["ShiftLeft"] || keys["ShiftRight"] ? SPRINT_MUL : 1;
    const speed   = SPEED * sprint;

    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();

    moveDir.set(0, 0, 0);
    if (keys["KeyW"] || keys["ArrowUp"])    moveDir.add(forward);
    if (keys["KeyS"] || keys["ArrowDown"])  moveDir.sub(forward);
    if (keys["KeyA"] || keys["ArrowLeft"])  moveDir.sub(right);
    if (keys["KeyD"] || keys["ArrowRight"]) moveDir.add(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(speed * dt);
      playerPos.x += moveDir.x;
      playerPos.z += moveDir.z;
    }

    // World boundary
    const BOUND = 90;
    playerPos.x = Math.max(-BOUND, Math.min(BOUND, playerPos.x));
    playerPos.z = Math.max(-BOUND, Math.min(BOUND, playerPos.z));

    // ---- vertical / gravity ----
    if ((keys["Space"] || keys["KeyF"]) && isOnGround) {
      velocityY   = JUMP_VEL;
      isOnGround  = false;
    }

    velocityY    += GRAVITY * dt;
    playerPos.y  += velocityY * dt;

    // Simple flat ground collision at y = 1.7 (eye height)
    if (playerPos.y <= 1.7) {
      playerPos.y = 1.7;
      velocityY   = 0;
      isOnGround  = true;
    }
  }

  // ── HUD overlay (click to start + crosshair) ─────────────────
  function buildHUD() {
    // Hint overlay
    const hint = document.createElement("div");
    hint.id = "game-hint";
    Object.assign(hint.style, {
      position:       "absolute",
      inset:          "0",
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      color:          "#c8e6c0",
      fontFamily:     "'Courier New', monospace",
      fontSize:       "1rem",
      background:     "rgba(0,0,0,0.55)",
      pointerEvents:  "none",
      zIndex:         "10",
      textAlign:      "center",
      gap:            "0.5rem",
      letterSpacing:  "0.05em",
    });
    hint.innerHTML = `
      <div style="font-size:1.6rem;margin-bottom:0.4rem;">🌲 SURVIVAL WORLD</div>
      <div>Click to enter</div>
      <div style="opacity:0.7;font-size:0.85rem;margin-top:0.6rem;">
        WASD / Arrow Keys — Move &nbsp;|&nbsp; Mouse — Look<br>
        Shift — Sprint &nbsp;|&nbsp; Space — Jump &nbsp;|&nbsp; Esc — Exit
      </div>
    `;

    // Crosshair
    const cross = document.createElement("div");
    cross.id = "game-crosshair";
    Object.assign(cross.style, {
      position:  "absolute",
      top:       "50%",
      left:      "50%",
      transform: "translate(-50%, -50%)",
      width:     "20px",
      height:    "20px",
      pointerEvents: "none",
      zIndex:    "20",
      display:   "none",
    });
    cross.innerHTML = `
      <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
        <line x1="10" y1="2" x2="10" y2="8"  stroke="#c8e6c0" stroke-width="1.5"/>
        <line x1="10" y1="12" x2="10" y2="18" stroke="#c8e6c0" stroke-width="1.5"/>
        <line x1="2"  y1="10" x2="8"  y2="10" stroke="#c8e6c0" stroke-width="1.5"/>
        <line x1="12" y1="10" x2="18" y2="10" stroke="#c8e6c0" stroke-width="1.5"/>
      </svg>`;

    // Show/hide crosshair with lock state
    document.addEventListener("pointerlockchange", () => {
      cross.style.display = (document.pointerLockElement === canvas) ? "block" : "none";
    });

    // Wrap canvas in a relative container if not already
    const wrapper = canvas.parentElement;
    if (getComputedStyle(wrapper).position === "static") {
      wrapper.style.position = "relative";
    }
    wrapper.appendChild(hint);
    wrapper.appendChild(cross);
  }
  buildHUD();

  // ── Resize handler ───────────────────────────────────────────
  window.addEventListener("resize", () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  // ── Animate ──────────────────────────────────────────────────
  let lastTime = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);

    const dt = Math.min((now - lastTime) / 1000, 0.05); // cap at 50 ms
    lastTime  = now;

    // Movement
    updateMovement(dt);

    // Animate flames
    const t = now * 0.001;
    flames.forEach((f, i) => {
      f.position.y    = f._baseY + Math.sin(t * f._speed + f._phase) * 0.08;
      f.scale.x       = 1 + Math.sin(t * f._speed * 1.3 + f._phase) * 0.2;
      f.scale.z       = 1 + Math.cos(t * f._speed * 1.1 + f._phase) * 0.2;
      f.material.color.setHSL(
        0.05 + Math.sin(t * f._speed + f._phase) * 0.03, // hue
        1.0,
        0.5 + Math.sin(t * f._speed * 2) * 0.1           // lightness
      );
    });

    // Flicker campfire light
    fireLight.intensity = 2.5 + Math.sin(t * 7)  * 0.6 + Math.sin(t * 13) * 0.3;
    fireFill.intensity  = 1.0 + Math.sin(t * 11) * 0.3;

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);

})();