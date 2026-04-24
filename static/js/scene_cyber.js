/**
 * scene_cyber.js
 * ─────────────────────────────────────────────────────────────
 * Floating circuit-board / matrix particle field for the
 * Cybersecurity pages.  Two "zones" — Red Team (amber/red)
 * and Blue Team (teal/blue).
 *
 * Exported: initCyberScene(canvas) → returns cleanup()
 * ─────────────────────────────────────────────────────────────
 */

function initCyberScene(canvas) {
  /* ── Renderer ── */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  /* ── Scene ── */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060409);
  scene.fog = new THREE.FogExp2(0x070408, 0.04);

  /* ── Camera ── */
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 150);
  camera.position.set(0, 0, 18);
  camera.lookAt(0, 0, 0);

  /* ════════════════════════════════════════════
     RED TEAM PARTICLE CLOUD  (amber / red tones)
  ════════════════════════════════════════════ */
  const RED_COUNT  = 1800;
  const redPos     = new Float32Array(RED_COUNT * 3);
  const redSpeeds  = new Float32Array(RED_COUNT);

  for (let i = 0; i < RED_COUNT; i++) {
    redPos[i * 3 + 0] = (Math.random() - 0.5) * 30 - 5;   // left cluster
    redPos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    redPos[i * 3 + 2] = (Math.random() - 0.5) * 20;
    redSpeeds[i] = (Math.random() - 0.5) * 0.008;
  }

  const redGeo = new THREE.BufferGeometry();
  redGeo.setAttribute('position', new THREE.Float32BufferAttribute(redPos, 3));

  const redMat = new THREE.PointsMaterial({
    color: 0xff3322,
    size: 0.10,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.65,
  });

  scene.add(new THREE.Points(redGeo, redMat));

  /* ════════════════════════════════════════════
     BLUE TEAM PARTICLE CLOUD  (teal / blue tones)
  ════════════════════════════════════════════ */
  const BLUE_COUNT  = 1800;
  const bluePos     = new Float32Array(BLUE_COUNT * 3);
  const blueSpeeds  = new Float32Array(BLUE_COUNT);

  for (let i = 0; i < BLUE_COUNT; i++) {
    bluePos[i * 3 + 0] = (Math.random() - 0.5) * 30 + 5;   // right cluster
    bluePos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    bluePos[i * 3 + 2] = (Math.random() - 0.5) * 20;
    blueSpeeds[i] = (Math.random() - 0.5) * 0.008;
  }

  const blueGeo = new THREE.BufferGeometry();
  blueGeo.setAttribute('position', new THREE.Float32BufferAttribute(bluePos, 3));

  const blueMat = new THREE.PointsMaterial({
    color: 0x00ccff,
    size: 0.10,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.65,
  });

  scene.add(new THREE.Points(blueGeo, blueMat));

  /* ════════════════════════════════════════════
     CIRCUIT HEX GRID (flat torus-like ring)
  ════════════════════════════════════════════ */
  const HEX_COUNT = 60;
  const hexGroup  = new THREE.Group();

  for (let i = 0; i < HEX_COUNT; i++) {
    const angle  = (i / HEX_COUNT) * Math.PI * 2;
    const radius = 8 + Math.random() * 4;
    const y      = (Math.random() - 0.5) * 10;
    const size   = 0.15 + Math.random() * 0.3;

    const hexGeo = new THREE.CircleGeometry(size, 6);
    const hexMat = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? 0xff4422 : 0x0099ff,
      wireframe: true,
    });
    const hexMesh = new THREE.Mesh(hexGeo, hexMat);
    hexMesh.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    hexMesh.lookAt(0, y, 0);
    hexMesh.userData.angleSeed = angle;
    hexMesh.userData.radius    = radius;
    hexGroup.add(hexMesh);
  }
  scene.add(hexGroup);

  /* ════════════════════════════════════════════
     CONNECTION LINES (simulated data streams)
  ════════════════════════════════════════════ */
  const LINES = 12;
  const lineGroup = new THREE.Group();

  for (let l = 0; l < LINES; l++) {
    const points = [];
    const startX = (Math.random() - 0.5) * 20;
    const startY = (Math.random() - 0.5) * 10;
    const endX   = (Math.random() - 0.5) * 20;
    const endY   = (Math.random() - 0.5) * 10;

    for (let p = 0; p <= 20; p++) {
      const t  = p / 20;
      const bx = startX + (endX - startX) * t;
      const by = startY + (endY - startY) * t + Math.sin(t * Math.PI) * 2;
      points.push(new THREE.Vector3(bx, by, (Math.random() - 0.5) * 5));
    }

    const lineGeo  = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat  = new THREE.LineBasicMaterial({
      color: l % 2 === 0 ? 0xff3300 : 0x0077ff,
      opacity: 0.25,
      transparent: true,
    });
    lineGroup.add(new THREE.Line(lineGeo, lineMat));
  }
  scene.add(lineGroup);

  /* ════════════════════════════════════════════
     LARGE CENTRE SPHERE (glowing core)
  ════════════════════════════════════════════ */
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    side: THREE.BackSide,
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal     = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3  vNormal;
      void main() {
        float pulse = 0.5 + 0.5 * sin(uTime * 1.5);
        float rim   = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
        vec3  redCol  = vec3(1.0, 0.15, 0.05);
        vec3  blueCol = vec3(0.05, 0.55, 1.0);
        vec3  col     = mix(redCol, blueCol, 0.5 + 0.5 * sin(uTime * 0.4));
        gl_FragColor  = vec4(col * rim * pulse * 0.6, rim * 0.4);
      }
    `,
  });

  const core = new THREE.Mesh(new THREE.SphereGeometry(3.5, 32, 32), coreMat);
  scene.add(core);

  /* ════════════════════════════════════════════
     LIGHTING
  ════════════════════════════════════════════ */
  scene.add(new THREE.AmbientLight(0x110008, 4));

  const redGlow  = new THREE.PointLight(0xff2200, 3, 30);
  redGlow.position.set(-8, 0, 0);
  scene.add(redGlow);

  const blueGlow = new THREE.PointLight(0x0055ff, 3, 30);
  blueGlow.position.set(8, 0, 0);
  scene.add(blueGlow);

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
  let time = 0;

  function animate() {
    rafId = requestAnimationFrame(animate);
    time += 0.012;

    coreMat.uniforms.uTime.value = time;

    /* Rotate hex ring */
    hexGroup.rotation.y  += 0.003;
    hexGroup.rotation.x   = Math.sin(time * 0.2) * 0.2;
    lineGroup.rotation.y -= 0.002;

    /* Drift red particles */
    const rp = redGeo.attributes.position.array;
    for (let i = 0; i < RED_COUNT; i++) {
      rp[i * 3 + 1] += redSpeeds[i];
      rp[i * 3 + 0] += Math.sin(time + i * 0.3) * 0.002;
      if (rp[i * 3 + 1] >  10) rp[i * 3 + 1] = -10;
      if (rp[i * 3 + 1] < -10) rp[i * 3 + 1] =  10;
    }
    redGeo.attributes.position.needsUpdate = true;

    /* Drift blue particles */
    const bp = blueGeo.attributes.position.array;
    for (let i = 0; i < BLUE_COUNT; i++) {
      bp[i * 3 + 1] += blueSpeeds[i];
      bp[i * 3 + 0] += Math.cos(time + i * 0.4) * 0.002;
      if (bp[i * 3 + 1] >  10) bp[i * 3 + 1] = -10;
      if (bp[i * 3 + 1] < -10) bp[i * 3 + 1] =  10;
    }
    blueGeo.attributes.position.needsUpdate = true;

    /* Pulsing lights */
    redGlow.intensity  = 2.5 + Math.sin(time * 2.0) * 0.8;
    blueGlow.intensity = 2.5 + Math.cos(time * 1.8) * 0.8;

    /* Camera parallax */
    camera.position.x += (mx * 4 - camera.position.x) * 0.02;
    camera.position.y += (-my * 2 - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  animate();

  /* Cleanup */
  return function cleanup() {
    cancelAnimationFrame(rafId);
    window.removeEventListener('mousemove', onMouse);
    window.removeEventListener('resize', onResize);
    renderer.dispose();
  };
}
