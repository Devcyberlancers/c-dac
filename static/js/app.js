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

  /**
   * Map page IDs → scene initialiser functions.
   * 'agri' shares the home grass scene (looks great on subpage too).
   */
  const SCENE_MAP = {
    home  : () => initHomeScene(canvas),
    agri  : () => initHomeScene(canvas),    // green field fits agriculture
    water : () => initWaterScene(canvas),
    cyber : () => initCyberScene(canvas),
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
