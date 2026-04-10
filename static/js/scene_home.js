/**
 * scene_home.js
 * ─────────────────────────────────────────────────────────────
 * Animated grass / plant-field background for the Home page.
 * Uses Three.js InstancedMesh + custom GLSL wind vertex shader.
 *
 * Exported: initHomeScene(canvas) → returns cleanup()
 * ─────────────────────────────────────────────────────────────
 */

function initHomeScene(canvas) {
  /* ── Renderer ── */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  /* ── Scene ── */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05130a);
  scene.fog = new THREE.FogExp2(0x071a0b, 0.06);

  /* ── Camera ── */
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.position.set(0, 2.5, 12);
  camera.lookAt(0, 0.8, 0);

  /* ════════════════════════════════════════════
     GRASS BLADE GEOMETRY  (single blade, Y-up)
  ════════════════════════════════════════════ */
  const SEGS = 5;          // vertical segments per blade
  const BLADE_W = 0.055;   // half-width at base
  const BLADE_H = 1.0;     // height (scaled per instance)

  const verts = [];
  const uvArr = [];
  const idxArr = [];

  for (let s = 0; s <= SEGS; s++) {
    const t = s / SEGS;
    const y = t * BLADE_H;
    const w = BLADE_W * (1.0 - t * 0.75);   // taper toward tip
    const lean = t * t * 0.18;               // slight forward lean

    verts.push(-w, y, lean,   w, y, lean);
    uvArr.push(0, t,   1, t);
  }
  for (let s = 0; s < SEGS; s++) {
    const b = s * 2;
    idxArr.push(b, b + 2, b + 1,   b + 1, b + 2, b + 3);
  }

  const bladeGeo = new THREE.BufferGeometry();
  bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  bladeGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvArr, 2));
  bladeGeo.setIndex(idxArr);
  bladeGeo.computeVertexNormals();

  /* ════════════════════════════════════════════
     WIND SHADER MATERIAL
  ════════════════════════════════════════════ */
  const bladeMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    side: THREE.DoubleSide,
    transparent: true,
    vertexShader: /* glsl */ `
      uniform float uTime;

      varying vec2 vUv;
      varying float vHeight;

      void main() {
        vUv     = uv;
        vHeight = uv.y;  // 0 = base, 1 = tip

        /* Transform to world space */
        vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);

        /* Blade root in world space (used as wind phase) */
        vec4 root = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

        /* Wind: only tips sway (quadratic) */
        float sway = vHeight * vHeight;
        float phase = root.x * 0.9 + root.z * 0.7;

        worldPos.x += sin(uTime * 1.8 + phase)        * sway * 0.38;
        worldPos.z += cos(uTime * 1.4 + phase + 0.9)  * sway * 0.12;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2  vUv;
      varying float vHeight;

      void main() {
        /* Dark earthy base → bright lime tip */
        vec3 baseCol = vec3(0.03, 0.12, 0.02);
        vec3 midCol  = vec3(0.08, 0.34, 0.05);
        vec3 tipCol  = vec3(0.28, 0.72, 0.10);

        vec3 col = mix(baseCol, midCol, vHeight);
        col      = mix(col,    tipCol, smoothstep(0.5, 1.0, vHeight));

        /* Soft alpha at tip */
        float alpha = vHeight > 0.88 ? 1.0 - (vHeight - 0.88) * 8.3 : 1.0;

        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  /* ════════════════════════════════════════════
     INSTANCED GRASS MESH
  ════════════════════════════════════════════ */
  const BLADE_COUNT = 60000;
  const FIELD = 22;          // field radius in world units

  const grass = new THREE.InstancedMesh(bladeGeo, bladeMat, BLADE_COUNT);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < BLADE_COUNT; i++) {
    /* Polar coords for random but even-ish distribution */
    const r   = Math.sqrt(Math.random()) * FIELD;
    const ang = Math.random() * Math.PI * 2;
    const x   = Math.cos(ang) * r;
    const z   = Math.sin(ang) * r;

    dummy.position.set(x, 0, z);
    dummy.rotation.y = Math.random() * Math.PI * 2;
    const s = 0.55 + Math.random() * 1.1;
    dummy.scale.set(s * 0.9, s, s * 0.9);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  }
  grass.instanceMatrix.needsUpdate = true;
  scene.add(grass);

  /* ════════════════════════════════════════════
     GROUND PLANE
  ════════════════════════════════════════════ */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshLambertMaterial({ color: 0x071508 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);

  /* ════════════════════════════════════════════
     POLLEN / SEED PARTICLES
  ════════════════════════════════════════════ */
  const POLLEN = 800;
  const pollenPositions = new Float32Array(POLLEN * 3);
  const pollenSpeeds    = new Float32Array(POLLEN);

  for (let i = 0; i < POLLEN; i++) {
    pollenPositions[i * 3 + 0] = (Math.random() - 0.5) * 18;
    pollenPositions[i * 3 + 1] = Math.random() * 5;
    pollenPositions[i * 3 + 2] = (Math.random() - 0.5) * 18;
    pollenSpeeds[i] = 0.004 + Math.random() * 0.006;
  }

  const pollenGeo = new THREE.BufferGeometry();
  pollenGeo.setAttribute('position', new THREE.Float32BufferAttribute(pollenPositions, 3));

  const pollenMat = new THREE.PointsMaterial({
    color: 0xc8ff88,
    size: 0.07,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
  });

  const pollenMesh = new THREE.Points(pollenGeo, pollenMat);
  scene.add(pollenMesh);

  /* ════════════════════════════════════════════
     LIGHTING
  ════════════════════════════════════════════ */
  scene.add(new THREE.AmbientLight(0x1a4a10, 2.5));

  const sun = new THREE.DirectionalLight(0x80ff40, 1.2);
  sun.position.set(8, 15, 6);
  scene.add(sun);

  const fillLight = new THREE.PointLight(0x00ff88, 0.4, 20);
  fillLight.position.set(-5, 3, 0);
  scene.add(fillLight);

  /* ════════════════════════════════════════════
     MOUSE PARALLAX
  ════════════════════════════════════════════ */
  let mx = 0, my = 0;
  const onMouse = (e) => {
    mx = (e.clientX / window.innerWidth  - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener('mousemove', onMouse);

  /* ════════════════════════════════════════════
     RESIZE
  ════════════════════════════════════════════ */
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  /* ════════════════════════════════════════════
     ANIMATION LOOP
  ════════════════════════════════════════════ */
  let rafId;
  let t = 0;
  const BASE_CAM_X = 0, BASE_CAM_Y = 2.5, BASE_CAM_Z = 12;

  function animate() {
    rafId = requestAnimationFrame(animate);
    t += 0.012;

    bladeMat.uniforms.uTime.value = t;

    /* Camera parallax (smooth lerp) */
    camera.position.x += (BASE_CAM_X + mx * 2.5 - camera.position.x) * 0.025;
    camera.position.y += (BASE_CAM_Y - my * 0.5 - camera.position.y) * 0.025;
    camera.lookAt(0, 0.8, 0);

    /* Pollen drift */
    const pa = pollenGeo.attributes.position.array;
    for (let i = 0; i < POLLEN; i++) {
      pa[i * 3 + 0] += Math.sin(t + i * 1.3) * pollenSpeeds[i] * 0.8;
      pa[i * 3 + 1] += pollenSpeeds[i];
      pa[i * 3 + 2] += Math.cos(t * 0.7 + i * 0.9) * pollenSpeeds[i] * 0.5;

      /* Wrap */
      if (pa[i * 3 + 1] > 5.5) pa[i * 3 + 1] = 0.2;
      if (pa[i * 3 + 0] >  9)  pa[i * 3 + 0] = -9;
      if (pa[i * 3 + 0] < -9)  pa[i * 3 + 0] =  9;
    }
    pollenGeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
  }

  animate();

  /* ════════════════════════════════════════════
     CLEANUP  (called when navigating away)
  ════════════════════════════════════════════ */
  return function cleanup() {
    cancelAnimationFrame(rafId);
    window.removeEventListener('mousemove', onMouse);
    window.removeEventListener('resize', onResize);
    renderer.dispose();
    bladeGeo.dispose();
    bladeMat.dispose();
    pollenGeo.dispose();
    pollenMat.dispose();
  };
}
