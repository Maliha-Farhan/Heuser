/* ═══════════════════════════════════════════════════
   THE ROOTED CHRONICLE — Navigation Logic
   Photo only in Foundation · Emblem + dot navigation
   ═══════════════════════════════════════════════════ */

(function () {
  'use strict';

  var PANELS = ['foundation', 'archives', 'horizon'];
  var activeIndex = 0;
  var isTransitioning = false;

  // DOM
  var panelEls = {};
  PANELS.forEach(function (id) {
    panelEls[id] = document.getElementById('panel-' + id);
  });
  var emblems = document.querySelectorAll('.emblem');
  var dots = document.querySelectorAll('.indicator__dot');

  // ── Switch Panel ───────────────────────────────
  function switchTo(targetId) {
    var targetIndex = PANELS.indexOf(targetId);
    if (targetIndex === -1 || targetIndex === activeIndex || isTransitioning) return;

    isTransitioning = true;

    // Hide current
    panelEls[PANELS[activeIndex]].classList.remove('active');

    // Show target after fade-out
    setTimeout(function () {
      panelEls[targetId].classList.add('active');
      setTimeout(function () { isTransitioning = false; }, 650);
    }, 180);

    activeIndex = targetIndex;

    // Sync emblems
    emblems.forEach(function (e) {
      e.classList.toggle('active', e.dataset.panel === targetId);
    });

    // Sync dots
    dots.forEach(function (d) {
      d.classList.toggle('indicator__dot--active', d.dataset.panel === targetId);
    });
  }

  // ── Emblem clicks ──────────────────────────────
  emblems.forEach(function (btn) {
    btn.addEventListener('click', function () { switchTo(btn.dataset.panel); });
  });

  // ── Dot clicks ─────────────────────────────────
  dots.forEach(function (dot) {
    dot.addEventListener('click', function () { switchTo(dot.dataset.panel); });
  });

  // ── Keyboard ───────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (isTransitioning) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      var n = Math.min(activeIndex + 1, PANELS.length - 1);
      if (n !== activeIndex) switchTo(PANELS[n]);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      var p = Math.max(activeIndex - 1, 0);
      if (p !== activeIndex) switchTo(PANELS[p]);
    }
  });

  // ── Touch swipe ────────────────────────────────
  var tx = 0, ty = 0;
  document.addEventListener('touchstart', function (e) {
    tx = e.changedTouches[0].screenX;
    ty = e.changedTouches[0].screenY;
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (isTransitioning) return;
    var dx = e.changedTouches[0].screenX - tx;
    var dy = e.changedTouches[0].screenY - ty;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        var n = Math.min(activeIndex + 1, PANELS.length - 1);
        if (n !== activeIndex) switchTo(PANELS[n]);
      } else {
        var p = Math.max(activeIndex - 1, 0);
        if (p !== activeIndex) switchTo(PANELS[p]);
      }
    }
  }, { passive: true });

  // ── Mouse wheel ────────────────────────────────
  var wc = false;
  document.addEventListener('wheel', function (e) {
    if (isTransitioning || wc) return;
    wc = true;
    setTimeout(function () { wc = false; }, 1200);
    if (e.deltaY > 30) {
      var n = Math.min(activeIndex + 1, PANELS.length - 1);
      if (n !== activeIndex) switchTo(PANELS[n]);
    } else if (e.deltaY < -30) {
      var p = Math.max(activeIndex - 1, 0);
      if (p !== activeIndex) switchTo(PANELS[p]);
    }
  }, { passive: true });
})();
