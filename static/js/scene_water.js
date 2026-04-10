/**
 * scene_water.js  (v2 — Realistic Ocean Water)
 * ─────────────────────────────────────────────────────────────
 * Features:
 *  • Multi-frequency Gerstner-style wave displacement
 *  • Fresnel reflection (grazing angles reflect sky)
 *  • Animated caustic light patterns
 *  • Specular sun/moon highlight
 *  • Foam particles on wave crests
 *  • Rain drops falling into the surface
 *  • Rising bubble particles
 *  • Cinematic slow camera drift
 *
 * Exported: initWaterScene(canvas) → returns cleanup()
 * ─────────────────────────────────────────────────────────────
 */

function initWaterScene(canvas) {
  /* ── Renderer ── */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  /* ── Scene ── */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010812);
  scene.fog = new THREE.FogExp2(0x010d1f, 0.04);

  /* ── Camera ── */
  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 5, 16);
  camera.lookAt(0, 0, 0);

  /* ════════════════════════════════════════════
     OCEAN WATER PLANE
     High-segment plane for smooth wave deformation
  ════════════════════════════════════════════ */
  const waterGeo = new THREE.PlaneGeometry(60, 60, 180, 180);

  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:           { value: 0.0 },
      uCameraPosition: { value: camera.position },
    },
    side: THREE.DoubleSide,

    /* ── VERTEX: Multi-wave displacement ── */
    vertexShader: /* glsl */ `
      uniform float uTime;

      varying vec2  vUv;
      varying float vWave;
      varying vec3  vNormal2;   /* computed from displacement */
      varying vec3  vWorldPos;

      /*
       * Returns wave height at (x,y,t) using a superposition of
       * directional sine waves with different freq/amp/speed.
       */
      float waveH(float x, float y, float t) {
        float w = 0.0;

        /* Big slow rolling swells */
        w += sin( x * 0.25 + t * 0.70) * 0.45;
        w += sin( y * 0.20 + t * 0.60 + 1.1) * 0.40;

        /* Medium chop */
        w += sin((x + y) * 0.55 + t * 1.20) * 0.22;
        w += cos((x - y) * 0.50 + t * 0.95 + 2.3) * 0.20;
        w += sin( x * 0.90 + t * 1.40 + 1.7) * 0.12;
        w += cos( y * 0.80 + t * 1.10 + 0.9) * 0.14;

        /* Fine detail ripples */
        w += sin( x * 2.00 + t * 2.20 + 3.1) * 0.06;
        w += cos( y * 1.80 + t * 2.50 + 1.4) * 0.05;
        w += sin((x * 1.30 - y * 0.90) + t * 1.80) * 0.07;

        return w;
      }

      void main() {
        vUv = uv;

        vec3 pos = position;
        float h = waveH(pos.x, pos.y, uTime);
        pos.z  += h;
        vWave   = h;

        /* Finite-difference normal estimation */
        float eps = 0.25;
        float hx  = waveH(pos.x + eps, pos.y, uTime);
        float hy  = waveH(pos.x, pos.y + eps, uTime);
        vec3 tang_x = normalize(vec3(eps, 0.0, hx - h));
        vec3 tang_y = normalize(vec3(0.0, eps, hy - h));
        vNormal2 = normalize(cross(tang_y, tang_x));

        vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,

    /* ── FRAGMENT: Fresnel + Caustics + Foam ── */
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3  uCameraPosition;

      varying vec2  vUv;
      varying float vWave;
      varying vec3  vNormal2;
      varying vec3  vWorldPos;

      /* Hash for cheap noise in caustics */
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      /* 2-D value noise */
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1,0)), f.x),
          mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
          f.y
        );
      }

      void main() {
        /* ── 1. Base water colour ── */
        vec3 deepCol    = vec3(0.004, 0.022, 0.16);
        vec3 midCol     = vec3(0.010, 0.095, 0.42);
        vec3 crustCol   = vec3(0.040, 0.38,  0.70);
        vec3 foamCol    = vec3(0.72,  0.90,  1.00);

        float wn = clamp((vWave + 1.3) / 2.2, 0.0, 1.0);  /* 0 = trough, 1 = crest */
        vec3 waterCol = mix(deepCol, midCol,   smoothstep(0.0, 0.55, wn));
        waterCol      = mix(waterCol, crustCol, smoothstep(0.5, 0.85, wn));

        /* ── 2. Caustic light patterns ── */
        vec2 caustUv = vUv * 14.0;
        float c1 = noise(caustUv + vec2( uTime * 0.5,  uTime * 0.3));
        float c2 = noise(caustUv + vec2(-uTime * 0.4,  uTime * 0.6) + 3.7);
        float c3 = noise(caustUv * 1.7 + vec2(uTime * 0.3, -uTime * 0.5) + 7.1);
        float caustics = pow(clamp((c1 * c2 + c2 * c3) - 0.25, 0.0, 1.0), 2.5);
        waterCol += vec3(0.10, 0.55, 1.00) * caustics * 0.35;

        /* ── 3. Fresnel reflection ── */
        vec3 viewDir = normalize(uCameraPosition - vWorldPos);
        float nDotV  = max(0.0, dot(vNormal2, viewDir));
        float fresnel = pow(1.0 - nDotV, 4.5);

        /* Sky/horizon colour to reflect */
        vec3 horizonCol = vec3(0.04, 0.10, 0.40);
        vec3 skyCol     = vec3(0.02, 0.06, 0.28);
        vec3 reflectCol = mix(horizonCol, skyCol, fresnel);

        waterCol = mix(waterCol, reflectCol, fresnel * 0.55);

        /* ── 4. Specular (moon / overhead light) ── */
        vec3 lightDir = normalize(vec3(-0.4, 1.0, 0.6));
        vec3 halfVec  = normalize(lightDir + viewDir);
        float spec    = pow(max(0.0, dot(vNormal2, halfVec)), 120.0);
        waterCol += vec3(0.75, 0.92, 1.00) * spec * 2.2;

        /* ── 5. Foam on crests ── */
        float foam = smoothstep(0.72, 1.0, wn);
        /* Add noise to foam edge for natural look */
        float foamNoise = noise(vUv * 40.0 + uTime * 0.8);
        foam *= (0.5 + foamNoise * 0.5);
        waterCol = mix(waterCol, foamCol, foam * 0.55);

        /* ── 6. Depth darkening at edges (vignette) ── */
        float distFromCenter = length(vUv - 0.5) * 2.0;
        float vignette = 1.0 - smoothstep(0.5, 1.0, distFromCenter) * 0.4;
        waterCol *= vignette;

        /* ── 7. Slight underwater scattering glow ── */
        waterCol += deepCol * 0.08;

        gl_FragColor = vec4(waterCol, 1.0);
      }
    `,
  });

  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.5;
  scene.add(water);

  /* ════════════════════════════════════════════
     RAIN DROP PARTICLES  (falling from above)
  ════════════════════════════════════════════ */
  const RAIN_COUNT = 2000;
  const rainPos    = new Float32Array(RAIN_COUNT * 3);
  const rainSpeed  = new Float32Array(RAIN_COUNT);

  function resetRainDrop(i) {
    rainPos[i * 3 + 0] = (Math.random() - 0.5) * 40;
    rainPos[i * 3 + 1] = 6 + Math.random() * 8;    // spawn high up
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 40;
    rainSpeed[i] = 0.12 + Math.random() * 0.15;
  }

  for (let i = 0; i < RAIN_COUNT; i++) {
    resetRainDrop(i);
    rainPos[i * 3 + 1] = (Math.random() - 0.5) * 14; // stagger initial height
  }

  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(rainPos, 3));

  const rainMat = new THREE.PointsMaterial({
    color: 0x88ccff,
    size: 0.045,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
  });

  scene.add(new THREE.Points(rainGeo, rainMat));

  /* ════════════════════════════════════════════
     SURFACE SPRAY / MIST PARTICLES
  ════════════════════════════════════════════ */
  const SPRAY_COUNT = 500;
  const sprayPos    = new Float32Array(SPRAY_COUNT * 3);
  const sprayVel    = [];

  for (let i = 0; i < SPRAY_COUNT; i++) {
    sprayPos[i * 3 + 0] = (Math.random() - 0.5) * 30;
    sprayPos[i * 3 + 1] = 0.1 + Math.random() * 0.8;
    sprayPos[i * 3 + 2] = (Math.random() - 0.5) * 30;
    sprayVel.push({
      vx: (Math.random() - 0.5) * 0.015,
      vy: 0.008 + Math.random() * 0.012,
      vz: (Math.random() - 0.5) * 0.015,
      life: Math.random(),
    });
  }

  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.Float32BufferAttribute(sprayPos, 3));

  const sprayMat = new THREE.PointsMaterial({
    color: 0xaae8ff,
    size: 0.08,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.35,
  });

  scene.add(new THREE.Points(sprayGeo, sprayMat));

  /* ════════════════════════════════════════════
     RISING BUBBLES  (deep underwater feel)
  ════════════════════════════════════════════ */
  const BUBBLE_COUNT = 400;
  const bubblePos    = new Float32Array(BUBBLE_COUNT * 3);
  const bubbleSpeed  = new Float32Array(BUBBLE_COUNT);

  for (let i = 0; i < BUBBLE_COUNT; i++) {
    bubblePos[i * 3 + 0] = (Math.random() - 0.5) * 25;
    bubblePos[i * 3 + 1] = -3 + Math.random() * 3;
    bubblePos[i * 3 + 2] = (Math.random() - 0.5) * 25;
    bubbleSpeed[i] = 0.012 + Math.random() * 0.02;
  }

  const bubbleGeo = new THREE.BufferGeometry();
  bubbleGeo.setAttribute('position', new THREE.Float32BufferAttribute(bubblePos, 3));

  const bubbleMat = new THREE.PointsMaterial({
    color: 0x44aadd,
    size: 0.055,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.4,
  });

  scene.add(new THREE.Points(bubbleGeo, bubbleMat));

  /* ════════════════════════════════════════════
     UNDERWATER CAUSTIC GLOW PLANES  (subtle)
     These are translucent planes below the water
     that show shimmering light patterns.
  ════════════════════════════════════════════ */
  const causticMat = new THREE.MeshBasicMaterial({
    color: 0x003366,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
  });

  const causticPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    causticMat
  );
  causticPlane.rotation.x = -Math.PI / 2;
  causticPlane.position.y = -3.5;
  scene.add(causticPlane);

  /* ════════════════════════════════════════════
     LIGHTING
  ════════════════════════════════════════════ */
  /* Deep blue ambient — feels like being near the ocean */
  scene.add(new THREE.AmbientLight(0x050d28, 8));

  /* "Moon" directional light — cool blue-white */
  const moonLight = new THREE.DirectionalLight(0x88aaff, 1.4);
  moonLight.position.set(-5, 12, 8);
  scene.add(moonLight);

  /* Underwater glow point lights — pulse like bioluminescence */
  const glow1 = new THREE.PointLight(0x0044ff, 2.0, 22);
  glow1.position.set(-6, -1, 0);
  scene.add(glow1);

  const glow2 = new THREE.PointLight(0x00ccff, 1.8, 18);
  glow2.position.set(8, -1, 5);
  scene.add(glow2);

  const glow3 = new THREE.PointLight(0x0088dd, 1.4, 16);
  glow3.position.set(0, -2, -6);
  scene.add(glow3);

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

  /* Cinematic camera: slow drift arc */
  const CAM_RADIUS = 16;
  let camAngle = 0;

  function animate() {
    rafId = requestAnimationFrame(animate);
    time += 0.010;

    /* Update water uniforms */
    waterMat.uniforms.uTime.value           = time;
    waterMat.uniforms.uCameraPosition.value = camera.position;

    /* Rain — fall down, reset at bottom */
    const rp = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN_COUNT; i++) {
      rp[i * 3 + 1] -= rainSpeed[i];
      /* Slight wind drift */
      rp[i * 3 + 0] += 0.008;
      if (rp[i * 3 + 1] < -0.5) resetRainDrop(i);
    }
    rainGeo.attributes.position.needsUpdate = true;

    /* Spray — rise and fade, then reset */
    const sp = sprayGeo.attributes.position.array;
    for (let i = 0; i < SPRAY_COUNT; i++) {
      const v = sprayVel[i];
      sp[i * 3 + 0] += v.vx;
      sp[i * 3 + 1] += v.vy;
      sp[i * 3 + 2] += v.vz;
      v.vy          -= 0.0003;  // gravity
      v.life        -= 0.012;
      if (v.life <= 0 || sp[i * 3 + 1] > 3) {
        /* Reset spray drop */
        sp[i * 3 + 0] = (Math.random() - 0.5) * 30;
        sp[i * 3 + 1] = -0.2 + Math.random() * 0.3;
        sp[i * 3 + 2] = (Math.random() - 0.5) * 30;
        v.vx = (Math.random() - 0.5) * 0.015;
        v.vy = 0.008 + Math.random() * 0.012;
        v.vz = (Math.random() - 0.5) * 0.015;
        v.life = 0.8 + Math.random() * 0.8;
      }
    }
    sprayGeo.attributes.position.needsUpdate = true;

    /* Bubbles rise */
    const bp = bubbleGeo.attributes.position.array;
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      bp[i * 3 + 1] += bubbleSpeed[i];
      bp[i * 3 + 0] += Math.sin(time * 0.8 + i) * 0.004;
      if (bp[i * 3 + 1] > 0.5) {
        bp[i * 3 + 1] = -3 + Math.random();
        bp[i * 3 + 0] = (Math.random() - 0.5) * 25;
        bp[i * 3 + 2] = (Math.random() - 0.5) * 25;
      }
    }
    bubbleGeo.attributes.position.needsUpdate = true;

    /* Pulsing underwater glow lights */
    glow1.intensity = 1.8 + Math.sin(time * 1.3) * 0.6;
    glow2.intensity = 1.6 + Math.cos(time * 1.7) * 0.6;
    glow3.intensity = 1.4 + Math.sin(time * 2.1 + 1.2) * 0.5;

    /* Cinematic slow camera arc + mouse parallax */
    camAngle += 0.0006;
    const targetX = Math.sin(camAngle) * 3 + mx * 2.5;
    const targetY = 5 - my * 1.2;
    const targetZ = Math.cos(camAngle * 0.7) * 2 + CAM_RADIUS;

    camera.position.x += (targetX - camera.position.x) * 0.018;
    camera.position.y += (targetY - camera.position.y) * 0.018;
    camera.position.z += (targetZ - camera.position.z) * 0.018;
    camera.lookAt(0, -0.5, 0);

    renderer.render(scene, camera);
  }

  animate();

  /* Cleanup */
  return function cleanup() {
    cancelAnimationFrame(rafId);
    window.removeEventListener('mousemove', onMouse);
    window.removeEventListener('resize', onResize);
    waterGeo.dispose(); waterMat.dispose();
    rainGeo.dispose();  rainMat.dispose();
    sprayGeo.dispose(); sprayMat.dispose();
    bubbleGeo.dispose(); bubbleMat.dispose();
    renderer.dispose();
  };
}
