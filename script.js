// ===================================================
// Pattern Memory Game – script.js
// With Web Audio API synthesized sound effects
// ===================================================

(() => {
  "use strict";

  // ─── Guessing Color Palettes per Difficulty ─────────
  const PALETTES = {
    easy:   ["electric", "hotpink", "neon"],
    medium: ["electric", "hotpink", "neon", "sunbeam"],
    hard:   ["electric", "hotpink", "neon", "sunbeam", "volt", "white"],
  };

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

  // ─── DOM Elements ──────────────────────────────────
  const $ = (sel) => document.querySelector(sel);

  const startScreen      = $("#start-screen");
  const startBtn         = $("#start-btn");
  const difficultySelect = $("#difficulty");
  const startHighScore   = $("#start-high-score");

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

  const endScreen   = $("#end-screen");
  const endCard     = $("#end-card");
  const endTitle    = $("#end-title");
  const endFeedback = $("#end-feedback");
  const endScoreEl  = $("#end-score");
  const endHighEl   = $("#end-high");
  const newHighBadge = $("#new-high-score-badge");
  const playAgainBtn = $("#play-again-btn");
  const menuBtn      = $("#menu-btn");

  // ─── State ─────────────────────────────────────────
  let currentRound    = 0;
  let score           = 0;
  let timerInterval   = null;
  let timeLeft        = TIMER_SECONDS;
  let isPlaying       = false;
  let isPaused        = false;
  let targetSequence  = [];
  let userSequence    = [];
  let palette         = PALETTES.medium;
  let highScore       = loadHighScore();

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

  /**
   * Play a bubbly click sound (~1 second).
   * Two overlapping sine oscillators with a quick pitch sweep.
   */
  function playClickSound() {
    const ctx = ensureAudioCtx();
    const now = ctx.currentTime;
    const duration = 0.25;     // short & snappy

    // Master gain
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.25, now);
    master.gain.exponentialRampToValueAtTime(0.001, now + duration);
    master.connect(ctx.destination);

    // Bubble oscillator 1
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(600, now);
    osc1.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
    osc1.frequency.exponentialRampToValueAtTime(400, now + duration);
    osc1.connect(master);
    osc1.start(now);
    osc1.stop(now + duration);

    // Bubble oscillator 2 (slightly offset)
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(900, now);
    osc2.frequency.exponentialRampToValueAtTime(1400, now + 0.06);
    osc2.frequency.exponentialRampToValueAtTime(500, now + duration);
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.15, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now + 0.03);
    osc2.stop(now + duration);
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
    const beepCount = 7;

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
   * Descending minor tones.
   */
  function playDisappointSound() {
    const ctx = ensureAudioCtx();
    const now = ctx.currentTime;
    const notes = [440, 370, 311, 261.6]; // A4-F#4-Eb4-C4 descending
    const noteDur = 0.4;

    notes.forEach((freq, i) => {
      const t = now + i * 0.35;

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

  // ─── LocalStorage ──────────────────────────────────
  function loadHighScore() {
    const stored = localStorage.getItem("patternMemoryHighScore");
    return stored ? parseInt(stored, 10) : 0;
  }

  function saveHighScore(val) {
    localStorage.setItem("patternMemoryHighScore", val);
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

  // ─── Timer ─────────────────────────────────────────
  function startTimer() {
    timeLeft = TIMER_SECONDS;
    timerEl.textContent = formatTime(timeLeft);
    timerEl.classList.remove("warning", "alarm-flash");

    timerInterval = setInterval(() => {
      if (isPaused) return;

      timeLeft--;
      timerEl.textContent = formatTime(timeLeft);

      if (timeLeft <= 5) timerEl.classList.add("warning");

      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        onTimerExpired();
      }
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // ─── Score & UI Updates ────────────────────────────
  function updateScoreUI() {
    scoreValueEl.textContent = score;
  }

  function updateRoundUI() {
    roundValueEl.textContent = currentRound;
  }

  // ─── Round Flow ────────────────────────────────────
  function startRound() {
    currentRound++;
    updateRoundUI();

    const seqLen = SEQ_LENGTHS[currentRound] || currentRound + 2;
    targetSequence = generateSequence(seqLen);
    userSequence = [];

    phaseLabel.textContent = "Memorize the pattern!";
    show(sequenceDisplay);
    hide(inputContainer);
    hide(roundResult);
    renderDots(sequenceDisplay, targetSequence);

    startTimer();
  }

  function onTimerExpired() {
    // Play 3-second timer alarm + visual cue
    playTimerAlarm();
    timerEl.classList.remove("warning");
    timerEl.classList.add("alarm-flash");
    setTimeout(() => timerEl.classList.remove("alarm-flash"), 3000);

    // Transition to guessing phase
    phaseLabel.textContent = "Your turn — reproduce it!";
    sequenceDisplay.innerHTML = "";
    hide(sequenceDisplay);
    show(inputContainer);

    userSeqPreview.innerHTML = "";
    undoBtn.disabled  = true;
    submitBtn.disabled = true;
  }

  // ─── User Input ────────────────────────────────────
  function onColorPick(color) {
    if (!isPlaying || isPaused) return;
    if (userSequence.length >= targetSequence.length) return;

    userSequence.push(color);
    renderDots(userSeqPreview, userSequence, "preview-dot");

    undoBtn.disabled = userSequence.length === 0;
    submitBtn.disabled = userSequence.length !== targetSequence.length;
  }

  function onUndo() {
    if (userSequence.length === 0) return;
    userSequence.pop();
    renderDots(userSeqPreview, userSequence, "preview-dot");

    undoBtn.disabled  = userSequence.length === 0;
    submitBtn.disabled = userSequence.length !== targetSequence.length;
  }

  function onSubmit() {
    if (userSequence.length !== targetSequence.length) return;
    stopTimer();

    const correct = userSequence.every((c, i) => c === targetSequence[i]);

    if (correct) {
      score++;
      resultIcon.textContent = "✅";
      resultText.textContent = "Correct! +1";
      resultText.className = "correct";
    } else {
      resultIcon.textContent = "❌";
      resultText.textContent = "Wrong!";
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

    setTimeout(() => {
      hide(roundResult);
      hide(sequenceDisplay);

      if (currentRound >= TOTAL_ROUNDS) {
        endGame();
      } else {
        startRound();
      }
    }, RESULT_DELAY_MS);
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
    stopTimer();
    hide(topBar);
    hide(gameArea);

    const fb = getFeedback(score);
    endTitle.textContent    = fb.title;
    endFeedback.textContent = fb.text;
    endScoreEl.textContent  = score;

    const isNewHigh = score > highScore;
    if (isNewHigh) {
      highScore = score;
      saveHighScore(highScore);
    }
    endHighEl.textContent = highScore;
    toggle(newHighBadge, isNewHigh);

    // End-game sound + visual based on score threshold
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
  }

  function resumeGame() {
    if (!isPaused) return;
    isPaused = false;
    pausePlayBtn.textContent = "⏸️";
    hide(pauseOverlay);
    sequenceDisplay.style.visibility = "visible";
  }

  // ─── Main Menu (green button) ─────────────────────
  function goToMainMenu() {
    isPlaying = false;
    isPaused  = false;
    stopTimer();

    hide(topBar);
    hide(gameArea);
    hide(pauseOverlay);
    hide(quitOverlay);
    hide(endScreen);

    startHighScore.textContent = highScore;
    show(startScreen);
  }

  // ─── Quit (red cross) with confirmation ───────────
  function promptQuit() {
    if (!isPlaying) return;
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
    resumeGame();
  }

  // ─── Start Game ───────────────────────────────────
  function startGame() {
    // Ensure AudioContext is initialized on user gesture
    ensureAudioCtx();

    palette = PALETTES[difficultySelect.value] || PALETTES.medium;
    buildColorButtons();

    currentRound = 0;
    score = 0;
    isPlaying = true;
    isPaused  = false;

    updateScoreUI();
    hide(startScreen);
    hide(endScreen);
    hide(quitOverlay);
    show(topBar);
    show(gameArea);

    startRound();
  }

  // ─── Event Listeners ──────────────────────────────
  startBtn.addEventListener("click", startGame);

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

  playAgainBtn.addEventListener("click", startGame);
  menuBtn.addEventListener("click", goToMainMenu);

  document.addEventListener("keydown", (e) => {
    if (!isPlaying) return;
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      isPaused ? resumeGame() : pauseGame();
    }
  });

  // ─── Init ──────────────────────────────────────────
  startHighScore.textContent = highScore;
  attachClickSounds();   // Global bubbly click on every button
})();
