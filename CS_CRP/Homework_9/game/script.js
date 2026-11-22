// ===================================================
// Pattern Memory Game – script.js
// Fully offline: Web Audio synthesized sounds, localStorage persistence
// Stages: easy / medium / hard, each with its own high score
// ===================================================

(() => {
  "use strict";

  // ─── Stages & Guessing Colors ───────────────────────
  const PALETTES = {
    easy:   ["electric", "hotpink", "neon"],
    medium: ["electric", "hotpink", "neon", "sunbeam"],
    hard:   ["electric", "hotpink", "neon", "sunbeam", "volt", "white"],
  };
  const STAGES = Object.keys(PALETTES);
  const STAGE_LABELS = { easy: "Easy", medium: "Medium", hard: "Hard" };

  const COLOR_NAMES = {
    electric: "Electric Cyan",
    neon:     "Neon Yellow-Green",
    hotpink:  "Hot Pink",
    white:    "Pure White",
    volt:     "Electric Violet",
    sunbeam:  "Vivid Amber",
  };

  const SEQ_LENGTHS = [0, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9];

  const TOTAL_ROUNDS    = 10;
  const TIMER_SECONDS   = 15;
  const RESULT_DELAY_MS = 1400;
  const SAVE_KEY        = "patternMemoryProgress";

  // ─── DOM Elements ──────────────────────────────────
  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const startScreen      = $("#start-screen");
  const startBtn         = $("#start-btn");
  const stageCards       = $$(".stage-card");
  const resumePanel      = $("#resume-panel");
  const resumeInfo       = $("#resume-info");
  const resumeSavedBtn   = $("#resume-saved-btn");
  const discardSavedBtn  = $("#discard-saved-btn");

  const topBar         = $("#top-bar");
  const timerEl        = $("#timer");
  const scoreValueEl   = $("#score-value");
  const roundValueEl   = $("#round-value");
  const pausePlayBtn   = $("#pause-play");
  const mainMenuBtn    = $("#main-menu");
  const quitBtn        = $("#quit");

  const gameArea         = $("#game-area");
  const phaseLabel       = $("#phase-label");
  const sequenceDisplay  = $("#sequence-display");
  const inputContainer   = $("#input-container");
  const userSeqPreview   = $("#user-sequence-preview");
  const colorButtonsWrap = $("#color-buttons");
  const undoBtn          = $("#undo-btn");
  const submitBtn        = $("#submit-btn");
  const roundResult      = $("#round-result");
  const resultIcon       = $("#result-icon");
  const resultText       = $("#result-text");

  const pauseOverlay = $("#pause-overlay");
  const resumeBtn    = $("#resume-btn");

  const quitOverlay    = $("#quit-overlay");
  const quitConfirmBtn = $("#quit-confirm");
  const quitCancelBtn  = $("#quit-cancel");

  const endScreen    = $("#end-screen");
  const endCard      = $("#end-card");
  const endTitle     = $("#end-title");
  const endFeedback  = $("#end-feedback");
  const endScoreEl   = $("#end-score");
  const endHighEl    = $("#end-high");
  const endHighLabel = $("#end-high-label");
  const newHighBadge = $("#new-high-score-badge");
  const playAgainBtn = $("#play-again-btn");
  const menuBtn      = $("#menu-btn");

  // ─── State ─────────────────────────────────────────
  let currentRound   = 0;
  let score          = 0;
  let timerInterval  = null;
  let resultTimeout  = null;
  let pendingAdvance = false;       // round result finished while paused
  let quitWasPaused  = false;       // game was already paused when Quit was pressed
  let timeLeft       = TIMER_SECONDS;
  let isPlaying      = false;
  let isPaused       = false;
  let phase          = "idle";      // "memorize" | "guess" | "result" | "idle"
  let targetSequence = [];
  let userSequence   = [];
  let selectedStage  = "medium";    // stage highlighted in the menu
  let currentStage   = "medium";    // stage of the running game
  let palette        = PALETTES.medium;

  // ===================================================
  // AUDIO ENGINE — Web Audio API (fully offline)
  // ===================================================
  let audioCtx = null;

  /** Lazily create AudioContext (must be after user gesture). */
  function ensureAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  /** One bubble "pop": a sine with a quick upward pitch sweep, then a drop. */
  function bubble(ctx, t, f0, f1, f2, dur, vol) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.3);
    osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + dur);
  }

  /**
   * Play a bubbly click sound (~1 second): a main pop followed by
   * a few smaller, quieter bubbles that trail off.
   */
  function playClickSound() {
    const ctx = ensureAudioCtx();
    const now = ctx.currentTime;

    bubble(ctx, now,        600, 1200, 400, 0.25, 0.25);
    bubble(ctx, now + 0.03, 900, 1400, 500, 0.22, 0.12);
    bubble(ctx, now + 0.32, 700, 1300, 450, 0.22, 0.10);
    bubble(ctx, now + 0.58, 800, 1500, 500, 0.20, 0.07);
    bubble(ctx, now + 0.80, 900, 1600, 600, 0.20, 0.04);
  }

  /**
   * Play timer-end alarm (~3 seconds).
   * Repeating beeps that fade out.
   */
  function playTimerAlarm() {
    const ctx = ensureAudioCtx();
    const now = ctx.currentTime;
    const totalDuration = 3;
    const beepDuration = 0.18;
    const beepGap = 0.22;
    const beepCount = 8;   // 8 x 0.4s = ~3s

    for (let i = 0; i < beepCount; i++) {
      const t = now + i * (beepDuration + beepGap);
      const vol = 0.3 * (1 - i / beepCount);  // fade out

      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.setValueAtTime(740, t + beepDuration * 0.5);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.02);
      gain.gain.setValueAtTime(vol, t + beepDuration - 0.03);
      gain.gain.linearRampToValueAtTime(0, t + beepDuration);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + beepDuration);
    }
  }

  /**
   * Play cheerful high-score sound (~2 seconds).
   * Ascending major arpeggio.
   */
  function playCheerfulSound() {
    const ctx = ensureAudioCtx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5-E5-G5-C6-E6
    const noteDur = 0.3;

    notes.forEach((freq, i) => {
      const t = now + i * 0.25;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.3, t + 0.04);
      gain.gain.setValueAtTime(0.3, t + noteDur - 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + noteDur + 0.15);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + noteDur + 0.15);
    });

    // Final shimmer chord
    const chord = [1046.5, 1318.5, 1568];
    chord.forEach((freq) => {
      const t = now + notes.length * 0.25;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.8);
    });
  }

  /**
   * Play disappointing low-score sound (~2 seconds).
   * Descending minor tones (4 x 0.45s + tail).
   */
  function playDisappointSound() {
    const ctx = ensureAudioCtx();
    const now = ctx.currentTime;
    const notes = [440, 370, 311, 261.6]; // A4-F#4-Eb4-C4 descending
    const noteDur = 0.4;

    notes.forEach((freq, i) => {
      const t = now + i * 0.45;

      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);
      // Slight pitch droop for sad feel
      osc.frequency.linearRampToValueAtTime(freq * 0.95, t + noteDur);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.05);
      gain.gain.setValueAtTime(0.25, t + noteDur - 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + noteDur + 0.2);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + noteDur + 0.2);
    });
  }

  // ───────────────────────────────────────────────────
  // Global click-sound hook: attach to every button
  // ───────────────────────────────────────────────────
  function attachClickSounds() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn || btn.disabled) return;

      playClickSound();

      // Visual flash feedback
      btn.classList.remove("click-flash");
      // Force reflow so re-adding the class restarts the animation
      void btn.offsetWidth;
      btn.classList.add("click-flash");
      setTimeout(() => btn.classList.remove("click-flash"), 300);
    });
  }

  // ===================================================
  // CORE GAME LOGIC
  // ===================================================

  // ─── LocalStorage: stage high scores ───────────────
  function hsKey(stage) { return "highScore_" + stage; }

  function loadHighScore(stage) {
    try {
      const n = parseInt(localStorage.getItem(hsKey(stage)), 10);
      return Number.isFinite(n) ? n : 0;
    } catch (_) { return 0; }
  }

  function saveHighScore(stage, val) {
    try { localStorage.setItem(hsKey(stage), String(val)); } catch (_) {}
  }

  // ─── LocalStorage: saved progress ──────────────────
  function saveProgress() {
    if (!isPlaying) return;
    const data = {
      stage: currentStage,
      round: currentRound,
      score,
      timeLeft,
      phase,
      target: targetSequence,
      user: userSequence,
      savedAt: Date.now(),
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (_) {}
  }

  function clearProgress() {
    try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
  }

  /** Returns a validated save object, or null. */
  function loadProgress() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!d || !PALETTES[d.stage]) return null;
      const pal = PALETTES[d.stage];
      const okSeq = (arr) => Array.isArray(arr) && arr.every((c) => pal.includes(c));
      if (!Number.isInteger(d.round) || d.round < 1 || d.round > TOTAL_ROUNDS) return null;
      if (!Number.isInteger(d.score)) return null;
      if (!["memorize", "guess", "result"].includes(d.phase)) return null;
      if (!okSeq(d.target) || !okSeq(d.user) || d.target.length === 0) return null;
      if (d.user.length > d.target.length) return null;
      d.timeLeft = Math.min(TIMER_SECONDS, Math.max(0, Number(d.timeLeft) || 0));
      return d;
    } catch (_) { return null; }
  }

  // ─── Helpers ───────────────────────────────────────
  function randomColor() {
    return palette[Math.floor(Math.random() * palette.length)];
  }

  function generateSequence(length) {
    return Array.from({ length }, randomColor);
  }

  function formatTime(seconds) {
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function show(el)  { el.classList.remove("hidden"); }
  function hide(el)  { el.classList.add("hidden"); }
  function toggle(el, visible) { visible ? show(el) : hide(el); }

  // ─── Render Dots ───────────────────────────────────
  function renderDots(container, colors, cssClass = "seq-dot") {
    container.innerHTML = "";
    colors.forEach((c) => {
      const dot = document.createElement("div");
      dot.className = `${cssClass} color-${c}`;
      container.appendChild(dot);
    });
  }

  // ─── Build Color Buttons ──────────────────────────
  function buildColorButtons() {
    colorButtonsWrap.innerHTML = "";
    palette.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = `color-btn color-${c}`;
      btn.dataset.color = c;
      btn.setAttribute("aria-label", COLOR_NAMES[c] || c);
      btn.addEventListener("click", () => onColorPick(c));
      colorButtonsWrap.appendChild(btn);
    });
  }

  // ─── Stage selection / menu UI ─────────────────────
  function selectStage(stage) {
    if (!PALETTES[stage]) return;
    selectedStage = stage;
    stageCards.forEach((card) => {
      const on = card.dataset.stage === stage;
      card.setAttribute("aria-checked", String(on));
      card.tabIndex = on ? 0 : -1;
    });
  }

  function refreshMenu() {
    STAGES.forEach((s) => {
      $("#best-" + s).textContent = loadHighScore(s);
    });

    const save = loadProgress();
    if (save) {
      resumeInfo.textContent =
        `Saved game: ${STAGE_LABELS[save.stage]} · Round ${save.round}/${TOTAL_ROUNDS} · Score ${save.score}`;
      show(resumePanel);
    } else {
      hide(resumePanel);
    }
  }

  // ─── Timer ─────────────────────────────────────────
  function startTimer(seconds = TIMER_SECONDS) {
    stopTimer();
    timeLeft = seconds;
    timerEl.textContent = formatTime(timeLeft);
    timerEl.classList.remove("warning", "alarm-flash");
    if (timeLeft <= 5) timerEl.classList.add("warning");

    timerInterval = setInterval(() => {
      if (isPaused) return;

      timeLeft--;
      timerEl.textContent = formatTime(timeLeft);

      if (timeLeft <= 5) timerEl.classList.add("warning");

      if (timeLeft <= 0) {
        stopTimer();
        onTimerExpired();
      }
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // ─── Score & UI Updates ────────────────────────────
  function updateScoreUI() { scoreValueEl.textContent = score; }
  function updateRoundUI() { roundValueEl.textContent = currentRound; }

  // ─── Round Flow ────────────────────────────────────
  function startRound() {
    currentRound++;
    updateRoundUI();

    const seqLen = SEQ_LENGTHS[currentRound] || currentRound + 2;
    targetSequence = generateSequence(seqLen);
    userSequence = [];
    phase = "memorize";

    phaseLabel.textContent = "Memorize the pattern!";
    show(sequenceDisplay);
    hide(inputContainer);
    hide(roundResult);
    renderDots(sequenceDisplay, targetSequence);

    startTimer();
  }

  /** Switch the screen to the guessing phase (also used when resuming). */
  function showGuessPhase() {
    phase = "guess";
    phaseLabel.textContent = "Your turn — reproduce it!";
    sequenceDisplay.innerHTML = "";
    hide(sequenceDisplay);
    hide(roundResult);
    show(inputContainer);

    renderDots(userSeqPreview, userSequence, "preview-dot");
    undoBtn.disabled   = userSequence.length === 0;
    submitBtn.disabled = userSequence.length !== targetSequence.length;
  }

  function onTimerExpired() {
    // 3-second timer alarm + visual cue
    playTimerAlarm();
    timerEl.classList.remove("warning");
    timerEl.classList.add("alarm-flash");
    setTimeout(() => timerEl.classList.remove("alarm-flash"), 3000);

    showGuessPhase();
  }

  // ─── User Input ────────────────────────────────────
  function onColorPick(color) {
    if (!isPlaying || isPaused || phase !== "guess") return;
    if (userSequence.length >= targetSequence.length) return;

    userSequence.push(color);
    renderDots(userSeqPreview, userSequence, "preview-dot");

    undoBtn.disabled   = userSequence.length === 0;
    submitBtn.disabled = userSequence.length !== targetSequence.length;
  }

  function onUndo() {
    if (isPaused || phase !== "guess" || userSequence.length === 0) return;
    userSequence.pop();
    renderDots(userSeqPreview, userSequence, "preview-dot");

    undoBtn.disabled   = userSequence.length === 0;
    submitBtn.disabled = userSequence.length !== targetSequence.length;
  }

  function onSubmit() {
    if (isPaused || phase !== "guess" || userSequence.length !== targetSequence.length) return;
    stopTimer();
    phase = "result";

    const correct = userSequence.every((c, i) => c === targetSequence[i]);

    if (correct) {
      score++;
      resultIcon.textContent = "✅";
      resultText.textContent = "Correct! +1";
      resultText.className = "correct";
    } else {
      score--;
      resultIcon.textContent = "❌";
      resultText.textContent = "Wrong! −1";
      resultText.className = "incorrect";

      show(sequenceDisplay);
      renderDots(sequenceDisplay, targetSequence);
      sequenceDisplay.classList.add("shake");
      setTimeout(() => sequenceDisplay.classList.remove("shake"), 500);
    }

    updateScoreUI();
    hide(inputContainer);
    phaseLabel.textContent = "";
    show(roundResult);

    resultTimeout = setTimeout(advanceAfterResult, RESULT_DELAY_MS);
  }

  function advanceAfterResult() {
    resultTimeout = null;
    if (!isPlaying) return;
    if (isPaused) { pendingAdvance = true; return; }   // wait until resumed
    hide(roundResult);
    hide(sequenceDisplay);

    if (currentRound >= TOTAL_ROUNDS) {
      endGame();
    } else {
      startRound();
    }
  }

  // ─── End Game ──────────────────────────────────────
  function getFeedback(s) {
    if (s >= 10) return { title: "Absolute Legend! 🏆", text: "Perfect score! Your memory is extraordinary." };
    if (s >= 8)  return { title: "Outstanding! 🌟",     text: "Incredible recall — you're a memory master." };
    if (s >= 6)  return { title: "Great Job! 💪",        text: "Solid performance. You've got a sharp mind." };
    if (s >= 4)  return { title: "Not Bad! 🙂",          text: "Decent effort — keep practicing to improve." };
    if (s >= 2)  return { title: "Room to Grow 🌱",      text: "You got a few right. Try again and beat your score!" };
    return              { title: "Tough Round 😅",        text: "Don't give up! Practice makes perfect." };
  }

  function endGame() {
    isPlaying = false;
    isPaused  = false;
    phase = "idle";
    stopTimer();
    clearTimeout(resultTimeout);
    resultTimeout = null;
    pendingAdvance = false;
    clearProgress();           // finished games are never resumable

    hide(topBar);
    hide(gameArea);
    hide(pauseOverlay);

    const fb = getFeedback(score);
    endTitle.textContent    = fb.title;
    endFeedback.textContent = fb.text;
    endScoreEl.textContent  = score;

    const prevBest  = loadHighScore(currentStage);
    const isNewHigh = score > prevBest;
    if (isNewHigh) saveHighScore(currentStage, score);

    endHighLabel.textContent = `${STAGE_LABELS[currentStage]} Best`;
    endHighEl.textContent    = Math.max(prevBest, score);
    toggle(newHighBadge, isNewHigh);

    // High-score board for all three stages
    STAGES.forEach((s) => {
      const cell = $("#hs-end-" + s);
      cell.textContent = loadHighScore(s);
      cell.parentElement.classList.toggle("current", s === currentStage);
    });

    // End-game sound + visual based on score threshold (2s)
    endCard.classList.remove("celebrate", "disappoint");
    if (score >= 5) {
      playCheerfulSound();
      endCard.classList.add("celebrate");
    } else {
      playDisappointSound();
      endCard.classList.add("disappoint");
    }

    show(endScreen);
  }

  // ─── Pause / Resume ───────────────────────────────
  function pauseGame() {
    if (!isPlaying || isPaused) return;
    isPaused = true;
    pausePlayBtn.textContent = "▶️";
    show(pauseOverlay);
    sequenceDisplay.style.visibility = "hidden";
    saveProgress();
  }

  function resumeGame() {
    if (!isPaused) return;
    isPaused = false;
    pausePlayBtn.textContent = "⏸️";
    hide(pauseOverlay);
    sequenceDisplay.style.visibility = "visible";
    if (pendingAdvance) {
      pendingAdvance = false;
      advanceAfterResult();
    }
  }

  // ─── Main Menu (green button) ─────────────────────
  // Leaves the running game saved so it can be resumed from the menu.
  function goToMainMenu() {
    if (isPlaying) saveProgress();

    isPlaying = false;
    isPaused  = false;
    stopTimer();
    clearTimeout(resultTimeout);
    resultTimeout = null;
    pendingAdvance = false;
    pausePlayBtn.textContent = "⏸️";
    sequenceDisplay.style.visibility = "visible";

    hide(topBar);
    hide(gameArea);
    hide(pauseOverlay);
    hide(quitOverlay);
    hide(endScreen);

    refreshMenu();
    show(startScreen);
  }

  // ─── Quit (red cross) with confirmation ───────────
  function promptQuit() {
    if (!isPlaying) return;
    quitWasPaused = isPaused;
    if (!isPaused) pauseGame();
    hide(pauseOverlay);
    show(quitOverlay);
  }

  function confirmQuit() {
    hide(quitOverlay);
    endGame();
  }

  function cancelQuit() {
    hide(quitOverlay);
    if (quitWasPaused) show(pauseOverlay);   // back to the pause screen
    else resumeGame();
  }

  // ─── Start / Resume Game ──────────────────────────
  function enterGameScreen() {
    ensureAudioCtx();   // AudioContext needs a user gesture
    palette = PALETTES[currentStage];
    buildColorButtons();

    isPlaying = true;
    isPaused  = false;
    pausePlayBtn.textContent = "⏸️";
    sequenceDisplay.style.visibility = "visible";

    updateScoreUI();
    updateRoundUI();
    hide(startScreen);
    hide(endScreen);
    hide(pauseOverlay);
    hide(quitOverlay);
    show(topBar);
    show(gameArea);
  }

  function startGame(stage) {
    currentStage = PALETTES[stage] ? stage : selectedStage;
    clearProgress();                 // a new game replaces any saved one
    currentRound = 0;
    score = 0;
    enterGameScreen();
    startRound();
  }

  function resumeSavedGame() {
    const d = loadProgress();
    if (!d) { refreshMenu(); return; }

    currentStage   = d.stage;
    currentRound   = d.round;
    score          = d.score;
    targetSequence = d.target;
    userSequence   = d.user;
    enterGameScreen();
    updateRoundUI();

    if (d.phase === "memorize") {
      phase = "memorize";
      phaseLabel.textContent = "Memorize the pattern!";
      show(sequenceDisplay);
      hide(inputContainer);
      hide(roundResult);
      renderDots(sequenceDisplay, targetSequence);
      if (d.timeLeft > 0) {
        startTimer(d.timeLeft);
      } else {
        timerEl.textContent = formatTime(0);
        showGuessPhase();
      }
    } else if (d.phase === "guess") {
      timerEl.textContent = formatTime(0);
      timerEl.classList.remove("warning", "alarm-flash");
      showGuessPhase();
    } else {
      // Saved while the round result was showing: move on to the next round.
      timerEl.textContent = formatTime(0);
      if (currentRound >= TOTAL_ROUNDS) endGame();
      else startRound();
    }
  }

  // ─── Event Listeners ──────────────────────────────
  stageCards.forEach((card) =>
    card.addEventListener("click", () => selectStage(card.dataset.stage))
  );

  // Arrow keys move between stages (standard radio-group behaviour)
  stageCards.forEach((card, i) =>
    card.addEventListener("keydown", (e) => {
      const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      const next = stageCards[(i + dir + stageCards.length) % stageCards.length];
      selectStage(next.dataset.stage);
      next.focus();
    })
  );

  startBtn.addEventListener("click", () => startGame(selectedStage));
  resumeSavedBtn.addEventListener("click", resumeSavedGame);
  discardSavedBtn.addEventListener("click", () => {
    clearProgress();
    refreshMenu();
  });

  pausePlayBtn.addEventListener("click", () => {
    isPaused ? resumeGame() : pauseGame();
  });

  resumeBtn.addEventListener("click", resumeGame);
  mainMenuBtn.addEventListener("click", goToMainMenu);

  quitBtn.addEventListener("click", promptQuit);
  quitConfirmBtn.addEventListener("click", confirmQuit);
  quitCancelBtn.addEventListener("click", cancelQuit);

  undoBtn.addEventListener("click", onUndo);
  submitBtn.addEventListener("click", onSubmit);

  playAgainBtn.addEventListener("click", () => startGame(currentStage));
  menuBtn.addEventListener("click", goToMainMenu);

  document.addEventListener("keydown", (e) => {
    if (!isPlaying) return;
    if (e.code === "Space" && (e.target === document.body || e.target === document.documentElement)) {
      e.preventDefault();
      isPaused ? resumeGame() : pauseGame();
    }
  });

  // Save progress when the tab/window is closed or refreshed.
  // pagehide + visibilitychange cover mobile browsers, where
  // beforeunload often doesn't fire.
  window.addEventListener("beforeunload", saveProgress);
  window.addEventListener("pagehide", saveProgress);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveProgress();
  });

  // ─── Init ──────────────────────────────────────────
  selectStage(selectedStage);
  refreshMenu();
  attachClickSounds();   // Global bubbly click on every button
})();
