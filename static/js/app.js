/**
 * app.js
 * ─────────────────────────────────────────────────────────────
 * Main application: SPA router, tab system, scene orchestrator.
 *
 * How scenes work:
 *   • One shared <canvas id="bg-canvas"> lives behind all pages.
 *   • When a page becomes active, its Three.js scene inits on
 *     the canvas.  The previous scene is disposed (cleanup()).
 *   • Agriculture page reuses the home grass scene (lighter).
 *
 * Future developer notes:
 *   • To add a new page: add a <div class="page" id="page-foo">
 *     in index.html, add a mapping in SCENE_MAP below, and
 *     create the corresponding initFooScene() in a new file.
 * ─────────────────────────────────────────────────────────────
 */

(() => {
  'use strict';

  /* ════════════════════════════════════════════
     SCENE MANAGER
  ════════════════════════════════════════════ */
  const canvas   = document.getElementById('bg-canvas');
  let activeScene = null;   // holds the cleanup() function

  function initCanvasFallbackScene(canvas, mode) {
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let w = 0;
    let h = 0;
    const isWater = mode === 'water';
    const isCyber = mode === 'cyber';
    const blades = Array.from({ length: 420 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      height: 28 + Math.random() * 70,
      width: 1 + Math.random() * 2.8,
      sway: Math.random() * Math.PI * 2,
      speed: 0.7 + Math.random() * 1.6,
      hue: 82 + Math.random() * 36,
      alpha: 0.28 + Math.random() * 0.55,
      layer: i % 3
    }));
    const particles = Array.from({ length: isCyber ? 120 : 95 }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: 1 + Math.random() * 4,
      speed: 0.08 + Math.random() * 0.28,
      alpha: 0.15 + Math.random() * 0.35
    }));

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawGrassBlade(b, t) {
      const baseX = b.x * w;
      const baseY = h * (0.72 + b.y * 0.32);
      const bladeH = b.height * (1 + b.layer * 0.28);
      const bend = Math.sin(t * b.speed + b.sway + b.x * 8) * (8 + b.layer * 5);
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(baseX + bend * 0.35, baseY - bladeH * 0.55, baseX + bend, baseY - bladeH);
      ctx.strokeStyle = 'hsla(' + b.hue + ', 78%, ' + (28 + b.layer * 8) + '%, ' + b.alpha + ')';
      ctx.lineWidth = b.width + b.layer * 0.8;
      ctx.stroke();
    }

    function draw(tMs) {
      const t = tMs * 0.001;
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, isWater ? '#031722' : isCyber ? '#070911' : '#041109');
      bg.addColorStop(0.55, isWater ? '#062735' : isCyber ? '#101420' : '#06180b');
      bg.addColorStop(1, isWater ? '#051318' : isCyber ? '#07090f' : '#123000');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of particles) {
        const x = ((p.x * w) + Math.sin(t * 0.5 + p.y * 8) * 18) % w;
        const y = ((p.y * h) + t * p.speed * 42) % h;
        ctx.fillStyle = isWater
          ? 'rgba(88, 221, 246, ' + p.alpha + ')'
          : isCyber
            ? 'rgba(244, 184, 74, ' + p.alpha + ')'
            : 'rgba(132, 214, 90, ' + p.alpha + ')';
        ctx.fillRect(x, y, p.size, p.size);
      }
      ctx.restore();

      if (!isCyber) {
        ctx.save();
        ctx.shadowColor = isWater ? 'rgba(88, 221, 246, 0.16)' : 'rgba(68, 170, 32, 0.18)';
        ctx.shadowBlur = 10;
        blades.forEach(b => drawGrassBlade(b, t));
        ctx.restore();
      } else {
        ctx.strokeStyle = 'rgba(244, 184, 74, 0.16)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 26; i += 1) {
          const y = (i / 26) * h + Math.sin(t + i) * 8;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y + Math.sin(t * 0.8 + i) * 16);
          ctx.stroke();
        }
      }

      const vignette = ctx.createRadialGradient(w * 0.5, h * 0.52, h * 0.08, w * 0.5, h * 0.52, h * 0.75);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
      raf = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(draw);
    return function cleanupFallbackScene() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      ctx.clearRect(0, 0, w, h);
    };
  }

  /**
   * Map page IDs → scene initialiser functions.
   * 'agri' shares the home grass scene (looks great on subpage too).
   */
  const hasThree = typeof window.THREE !== 'undefined';
  const SCENE_MAP = {
    home  : () => hasThree ? initHomeScene(canvas) : initCanvasFallbackScene(canvas, 'home'),
    agri  : () => hasThree ? initHomeScene(canvas) : initCanvasFallbackScene(canvas, 'home'),
    water : () => hasThree ? initWaterScene(canvas) : initCanvasFallbackScene(canvas, 'water'),
    cyber : () => hasThree ? initCyberScene(canvas) : initCanvasFallbackScene(canvas, 'cyber'),
  };

  function switchScene(pageId) {
    /* Dispose current scene */
    if (activeScene) { activeScene(); activeScene = null; }

    const init = SCENE_MAP[pageId];
    if (init) { activeScene = init(); }
  }

  /* ════════════════════════════════════════════
     SPA ROUTER
  ════════════════════════════════════════════ */
  function showPage(pageId) {
    /* Hash-based routing so browser back/forward works */
    history.pushState({ page: pageId }, '', '#' + pageId);
    _renderPage(pageId);
  }

  function _renderPage(pageId) {
    /* 1. Hide all pages */
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    /* 2. Show target page */
    const target = document.getElementById('page-' + pageId);
    if (!target) return;
    target.classList.add('active');

    /* 3. Update nav active state */
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.page === pageId);
    });

    /* 4. Swap 3D scene */
    switchScene(pageId);

    /* 5. Scroll to top */
    window.scrollTo({ top: 0, behavior: 'smooth' });

    /* 6. Animate content in */
    target.querySelectorAll('.reveal').forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(24px)';
      setTimeout(() => {
        el.style.transition = 'opacity 0.55s ease, transform 0.55s ease';
        el.style.opacity    = '1';
        el.style.transform  = 'translateY(0)';
      }, 80 + i * 50);
    });
  }

  /* ════════════════════════════════════════════
     TAB SYSTEM
  ════════════════════════════════════════════ */
  function showTab(pageId, tabId) {
    /* Deactivate all tabs within the current page */
    document.querySelectorAll(`#page-${pageId} .tab-btn`).forEach(b =>
      b.classList.remove('active')
    );
    document.querySelectorAll(`#page-${pageId} .tab-content`).forEach(c =>
      c.classList.remove('active')
    );

    /* Activate selected */
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');

    const activeBtn = document.querySelector(
      `#page-${pageId} .tab-btn[data-tab="${tabId}"]`
    );
    if (activeBtn) activeBtn.classList.add('active');
  }

  /* ════════════════════════════════════════════
     INIT: bind all click handlers
  ════════════════════════════════════════════ */
  function bindEvents() {
    /* Nav buttons */
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => showPage(btn.dataset.page));
    });

    /* Domain cards on home */
    document.querySelectorAll('[data-page]').forEach(el => {
      if (!el.classList.contains('nav-btn')) {
        el.addEventListener('click', () => showPage(el.dataset.page));
      }
    });

    /* Breadcrumb back links */
    document.querySelectorAll('.bc-link').forEach(el => {
      el.addEventListener('click', () => showPage(el.dataset.page));
    });

    /* Tab buttons */
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId  = btn.dataset.tab;
        /* Determine which page this tab lives in */
        const page   = btn.closest('.page');
        const pageId = page ? page.id.replace('page-', '') : 'home';
        showTab(pageId, tabId);
      });
    });

    /* Mobile menu toggle */
    const menuToggle = document.getElementById('menu-toggle');
    const navLinks   = document.querySelector('.nav-links');
    if (menuToggle && navLinks) {
      menuToggle.addEventListener('click', () =>
        navLinks.classList.toggle('open')
      );
    }

    /* Cyber team cards (navigate to sub-detail if needed) */
    document.querySelectorAll('.cyber-team-card').forEach(card => {
      card.addEventListener('click', () => {
        /* Future: route to /cyber/red or /cyber/blue */
        card.classList.toggle('expanded');
      });
    });
  }

  /* ════════════════════════════════════════════
     SCROLL REVEAL (IntersectionObserver)
  ════════════════════════════════════════════ */
  function setupScrollReveal() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });

    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  }

  /* ════════════════════════════════════════════
     NAVBAR SCROLL SHADOW
  ════════════════════════════════════════════ */
  function setupNavScroll() {
    const nav = document.getElementById('main-nav');
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
  }

  /* ════════════════════════════════════════════
     BROWSER BACK / FORWARD
  ════════════════════════════════════════════ */
  window.addEventListener('popstate', (e) => {
    const pageId = (e.state && e.state.page) || 'home';
    _renderPage(pageId);
  });

  /* ════════════════════════════════════════════
     BOOT
  ════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    setupScrollReveal();
    setupNavScroll();

    /* Honour hash on initial load */
    const hash   = window.location.hash.replace('#', '');
    const startId = ['home','agri','water','cyber'].includes(hash) ? hash : 'home';
    _renderPage(startId);
  });

})();
