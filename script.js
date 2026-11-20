/* ==========================================================================
   Maliha Farhan — Photo-Driven Radial Navigation
   ========================================================================== */

(() => {
  'use strict';

  const CHAPTERS = [
    {
      id: 'foundation',
      plinth: 'I of III \u2014 The Foundation',
      nextLabel: 'Chapter I: The Foundation. Click portrait to open Chapter II: The Archives.'
    },
    {
      id: 'archives',
      plinth: 'II of III \u2014 The Archives',
      nextLabel: 'Chapter II: The Archives. Click portrait to open Chapter III: The Story & Horizon.'
    },
    {
      id: 'horizon',
      plinth: 'III of III \u2014 Story & Horizon',
      nextLabel: 'Chapter III: Story & Horizon. Click portrait to return to Chapter I: The Foundation.'
    }
  ];

  const radialCanvas = document.getElementById('radial-canvas');
  const hubCenterpiece = document.getElementById('hub-centerpiece');
  const photoCycleBtn = document.getElementById('photo-cycle-btn');
  const plinthChapter = document.getElementById('plinth-chapter');
  const orbitalEmblems = Array.from(document.querySelectorAll('.orbital-emblem'));
  const orbitCards = Array.from(document.querySelectorAll('.orbit-card'));

  let currentChapterIndex = 0;
  let leaveTimer = null;
  let shiftTimer = null;

  /**
   * Switch the active chapter and synchronize centerpiece state, emblems, and cards.
   * @param {string} targetId
   */
  function setChapter(targetId) {
    const nextIndex = CHAPTERS.findIndex((chapter) => chapter.id === targetId);
    if (nextIndex === -1 || nextIndex === currentChapterIndex) return;

    const previousId = CHAPTERS[currentChapterIndex].id;
    currentChapterIndex = nextIndex;
    const nextChapter = CHAPTERS[currentChapterIndex];

    // Clear any interrupted transition timers on rapid clicks
    window.clearTimeout(leaveTimer);
    window.clearTimeout(shiftTimer);

    // 1. Update data attributes for centerpiece border & state sync
    hubCenterpiece.setAttribute('data-chapter', nextChapter.id);
    radialCanvas.setAttribute('data-active-chapter', nextChapter.id);

    // Subtle scale pulse on the portrait container during chapter transition
    hubCenterpiece.classList.add('is-shifting');
    shiftTimer = window.setTimeout(() => {
      hubCenterpiece.classList.remove('is-shifting');
    }, 360);

    // 2. Sync orbital emblem active states
    orbitalEmblems.forEach((emblem) => {
      const isMatch = emblem.getAttribute('data-target') === nextChapter.id;
      emblem.classList.toggle('is-active', isMatch);
      emblem.setAttribute('aria-pressed', String(isMatch));
    });

    // 3. Update centerpiece accessible label & plinth text
    photoCycleBtn.setAttribute('aria-label', nextChapter.nextLabel);
    if (plinthChapter) {
      plinthChapter.textContent = nextChapter.plinth;
    }

    // 4. Animate outgoing cards inward toward the photo and reveal incoming cards
    orbitCards.forEach((card) => {
      const cardChapter = card.getAttribute('data-chapter-panel');
      card.classList.remove('is-leaving');

      if (cardChapter === previousId) {
        card.classList.remove('is-active');
        card.classList.add('is-leaving');
        card.setAttribute('aria-hidden', 'true');
      } else if (cardChapter === nextChapter.id) {
        card.classList.add('is-active');
        card.setAttribute('aria-hidden', 'false');
      } else {
        card.classList.remove('is-active');
        card.setAttribute('aria-hidden', 'true');
      }
    });

    leaveTimer = window.setTimeout(() => {
      orbitCards.forEach((card) => card.classList.remove('is-leaving'));
    }, 300);
  }

  /**
   * Advance sequentially through chapters: Foundation -> Archives -> Story & Horizon.
   */
  function cycleNextChapter() {
    const nextIndex = (currentChapterIndex + 1) % CHAPTERS.length;
    setChapter(CHAPTERS[nextIndex].id);
  }

  /**
   * Navigate backward sequentially (used for optional ArrowLeft keyboard support).
   */
  function cyclePreviousChapter() {
    const prevIndex = (currentChapterIndex - 1 + CHAPTERS.length) % CHAPTERS.length;
    setChapter(CHAPTERS[prevIndex].id);
  }

  // Click central photo to cycle through the three chapters
  if (photoCycleBtn) {
    photoCycleBtn.addEventListener('click', cycleNextChapter);
  }

  // Click orbital emblems around the photo border to jump directly to a chapter
  orbitalEmblems.forEach((emblem) => {
    emblem.addEventListener('click', (event) => {
      event.stopPropagation();
      const targetId = emblem.getAttribute('data-target');
      if (targetId) {
        setChapter(targetId);
      }
    });
  });

  // Subtle keyboard arrow navigation across chapters
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tagName = document.activeElement ? document.activeElement.tagName : '';
    if (tagName === 'INPUT' || tagName === 'TEXTAREA') return;

    if (event.key === 'ArrowRight') {
      cycleNextChapter();
    } else if (event.key === 'ArrowLeft') {
      cyclePreviousChapter();
    }
  });

  // Initialize state on load
  if (photoCycleBtn) {
    photoCycleBtn.setAttribute('aria-label', CHAPTERS[0].nextLabel);
  }
})();
