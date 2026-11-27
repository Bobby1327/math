(() => {
  "use strict";

  const STORAGE_KEY_BEST = "conta_rapida_recorde_v1";
  const STORAGE_KEY_SOUND = "conta_rapida_som_v1";
  const ROUND_DURATION_SECONDS = 60;

  const state = {
    operation: "all",
    difficulty: "easy",
    mode: "timed",
    inputMode: "options",
    soundEnabled: true,
    bestScore: 0,

    // Active round state
    score: 0,
    correctCount: 0,
    wrongCount: 0,
    streak: 0,
    bestStreak: 0,
    questionNumber: 0,
    timeLeft: ROUND_DURATION_SECONDS,
    timerId: null,
    advanceTimeoutId: null,
    isLocked: false,
    isPlaying: false,
    currentQuestion: null,
  };

  // Elements
  const screens = {
    setup: document.getElementById("screen-setup"),
    play: document.getElementById("screen-play"),
    result: document.getElementById("screen-result"),
  };

  const bestScoreBadge = document.getElementById("best-score-badge");
  const soundToggleBtn = document.getElementById("sound-toggle");
  const startBtn = document.getElementById("start-btn");
  const quitBtn = document.getElementById("quit-btn");
  const playAgainBtn = document.getElementById("play-again-btn");
  const changeSettingsBtn = document.getElementById("change-settings-btn");

  const hudScore = document.getElementById("hud-score");
  const hudTimerBox = document.getElementById("hud-timer-box");
  const hudTimer = document.getElementById("hud-timer");
  const hudStreak = document.getElementById("hud-streak");
  const timerBarWrap = document.getElementById("timer-bar-wrap");
  const timerBar = document.getElementById("timer-bar");

  const questionBox = document.getElementById("question-box");
  const questionTag = document.getElementById("question-tag");
  const equationText = document.getElementById("equation-text");
  const feedbackLine = document.getElementById("feedback-line");

  const optionsGrid = document.getElementById("options-grid");
  const optionButtons = Array.from(optionsGrid.querySelectorAll(".option-btn"));
  const typeForm = document.getElementById("type-form");
  const answerInput = document.getElementById("answer-input");
  const controlsHint = document.getElementById("controls-hint");

  const resultEmoji = document.getElementById("result-emoji");
  const resultMessage = document.getElementById("result-message");
  const newRecordBadge = document.getElementById("new-record-badge");
  const resScore = document.getElementById("res-score");
  const resCorrect = document.getElementById("res-correct");
  const resAccuracy = document.getElementById("res-accuracy");
  const resStreak = document.getElementById("res-streak");

  // Audio helper (Web Audio API, no external files needed)
  let audioCtx = null;

  function playTone(type) {
    if (!state.soundEnabled) return;
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === "correct") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.11); // G5
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === "wrong") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(160, now + 0.18);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === "finish") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554.37, now + 0.09);
        osc.frequency.setValueAtTime(659.25, now + 0.18);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
        osc.start(now);
        osc.stop(now + 0.36);
      }
    } catch {
      // Ignore audio errors if blocked by browser policy
    }
  }

  function loadPreferences() {
    try {
      const savedBest = Number(localStorage.getItem(STORAGE_KEY_BEST));
      if (!Number.isNaN(savedBest) && savedBest > 0) {
        state.bestScore = savedBest;
      }
      const savedSound = localStorage.getItem(STORAGE_KEY_SOUND);
      if (savedSound !== null) {
        state.soundEnabled = savedSound === "true";
      }
    } catch {
      // Ignore storage errors
    }
    updateBestScoreUI();
    updateSoundUI();
  }

  function saveBestScore(value) {
    state.bestScore = value;
    updateBestScoreUI();
    try {
      localStorage.setItem(STORAGE_KEY_BEST, String(value));
    } catch {
      // Ignore storage errors
    }
  }

  function updateBestScoreUI() {
    bestScoreBadge.textContent = String(state.bestScore);
  }

  function updateSoundUI() {
    soundToggleBtn.textContent = state.soundEnabled ? "🔊" : "🔇";
    soundToggleBtn.title = state.soundEnabled ? "Som ligado" : "Som desligado";
  }

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      el.classList.toggle("is-active", key === name);
    });
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function pickOperation() {
    if (state.operation !== "all") return state.operation;
    const ops = ["add", "sub", "mul", "div"];
    return ops[randomInt(0, ops.length - 1)];
  }

  function generateQuestion() {
    const op = pickOperation();
    const ranges = {
      easy: { addSub: [1, 12], mul: [2, 9], divQ: [2, 9], divD: [2, 9] },
      medium: { addSub: [5, 35], mul: [3, 12], divQ: [2, 12], divD: [2, 12] },
      hard: { addSub: [15, 99], mul: [6, 19], divQ: [4, 20], divD: [3, 15] },
    };
    const cfg = ranges[state.difficulty];

    let a = 0;
    let b = 0;
    let symbol = "+";
    let answer = 0;

    if (op === "add") {
      a = randomInt(cfg.addSub[0], cfg.addSub[1]);
      b = randomInt(cfg.addSub[0], cfg.addSub[1]);
      symbol = "+";
      answer = a + b;
    } else if (op === "sub") {
      a = randomInt(cfg.addSub[0], cfg.addSub[1]);
      b = randomInt(cfg.addSub[0], cfg.addSub[1]);
      if (b > a) [a, b] = [b, a];
      symbol = "−";
      answer = a - b;
    } else if (op === "mul") {
      a = randomInt(cfg.mul[0], cfg.mul[1]);
      b = randomInt(cfg.mul[0], cfg.mul[1]);
      symbol = "×";
      answer = a * b;
    } else {
      // Exact integer division
      const divisor = randomInt(cfg.divD[0], cfg.divD[1]);
      const quotient = randomInt(cfg.divQ[0], cfg.divQ[1]);
      a = divisor * quotient;
      b = divisor;
      symbol = "÷";
      answer = quotient;
    }

    const options = buildOptions(answer);
    return {
      text: `${a} ${symbol} ${b} = ?`,
      answer,
      options,
    };
  }

  function buildOptions(answer) {
    const set = new Set([answer]);
    const offsets = [-10, -5, -3, -2, -1, 1, 2, 3, 5, 10];
    let safety = 0;

    while (set.size < 4 && safety < 50) {
      safety += 1;
      const offset = offsets[randomInt(0, offsets.length - 1)];
      const candidate = answer + offset;
      if (candidate >= 0 && candidate !== answer) {
        set.add(candidate);
      }
    }

    let fallback = 1;
    while (set.size < 4) {
      const candidate = answer + fallback;
      if (!set.has(candidate)) {
        set.add(candidate);
      }
      fallback += 1;
    }

    return shuffle(Array.from(set));
  }

  function renderQuestion() {
    state.questionNumber += 1;
    state.isLocked = false;
    state.currentQuestion = generateQuestion();

    questionBox.classList.remove("is-correct", "is-wrong");
    feedbackLine.textContent = "";
    feedbackLine.className = "feedback-line";
    questionTag.textContent = `Questão ${state.questionNumber}`;
    equationText.textContent = state.currentQuestion.text;

    if (state.inputMode === "options") {
      optionsGrid.classList.remove("is-hidden");
      typeForm.classList.add("is-hidden");
      controlsHint.innerHTML =
        "Dica: você pode usar as teclas <strong>1</strong>, <strong>2</strong>, <strong>3</strong> e <strong>4</strong> no teclado.";

      optionButtons.forEach((btn, idx) => {
        const val = state.currentQuestion.options[idx];
        btn.disabled = false;
        btn.classList.remove("is-correct", "is-wrong");
        btn.dataset.value = String(val);
        btn.querySelector(".option-val").textContent = String(val);
      });
    } else {
      optionsGrid.classList.add("is-hidden");
      typeForm.classList.remove("is-hidden");
      controlsHint.innerHTML =
        "Dica: digite o número e aperte <strong>Enter</strong> para enviar.";
      answerInput.value = "";
      answerInput.disabled = false;
      answerInput.focus();
    }
  }

  function updateHUD() {
    hudScore.textContent = String(state.score);
    hudStreak.textContent = `${state.streak} 🔥`;

    if (state.mode === "timed") {
      hudTimerBox.classList.remove("is-hidden");
      timerBarWrap.classList.remove("is-hidden");
      hudTimer.textContent = `${state.timeLeft}s`;
      const pct = Math.max(0, (state.timeLeft / ROUND_DURATION_SECONDS) * 100);
      timerBar.style.width = `${pct}%`;

      const isLow = state.timeLeft <= 10;
      hudTimerBox.classList.toggle("is-low", isLow);
      timerBar.classList.toggle("is-low", isLow);
    } else {
      hudTimerBox.classList.add("is-hidden");
      timerBarWrap.classList.add("is-hidden");
    }
  }

  function handleAnswer(selectedValue, clickedBtn = null) {
    if (!state.isPlaying || state.isLocked) return;
    state.isLocked = true;

    const correctAnswer = state.currentQuestion.answer;
    const isCorrect = selectedValue === correctAnswer;

    if (isCorrect) {
      state.correctCount += 1;
      state.streak += 1;
      if (state.streak > state.bestStreak) {
        state.bestStreak = state.streak;
      }
      const streakBonus = Math.min(state.streak - 1, 5) * 2;
      const earned = 10 + streakBonus;
      state.score += earned;

      questionBox.classList.add("is-correct");
      feedbackLine.textContent = `Acertou! +${earned} pontos`;
      feedbackLine.classList.add("is-correct");
      playTone("correct");
    } else {
      state.wrongCount += 1;
      state.streak = 0;

      questionBox.classList.add("is-wrong");
      feedbackLine.textContent = `Ops! A resposta certa era ${correctAnswer}.`;
      feedbackLine.classList.add("is-wrong");
      playTone("wrong");
    }

    if (state.inputMode === "options") {
      optionButtons.forEach((btn) => {
        btn.disabled = true;
        const val = Number(btn.dataset.value);
        if (val === correctAnswer) {
          btn.classList.add("is-correct");
        } else if (btn === clickedBtn && !isCorrect) {
          btn.classList.add("is-wrong");
        }
      });
    } else {
      answerInput.disabled = true;
    }

    updateHUD();

    const delay = isCorrect ? 420 : 850;
    state.advanceTimeoutId = window.setTimeout(() => {
      if (state.isPlaying) {
        renderQuestion();
      }
    }, delay);
  }

  function startTimer() {
    clearInterval(state.timerId);
    if (state.mode !== "timed") return;

    state.timerId = window.setInterval(() => {
      state.timeLeft -= 1;
      updateHUD();
      if (state.timeLeft <= 0) {
        finishGame();
      }
    }, 1000);
  }

  function startGame() {
    clearInterval(state.timerId);
    clearTimeout(state.advanceTimeoutId);

    state.score = 0;
    state.correctCount = 0;
    state.wrongCount = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.questionNumber = 0;
    state.timeLeft = ROUND_DURATION_SECONDS;
    state.isPlaying = true;
    state.isLocked = false;

    showScreen("play");
    updateHUD();
    renderQuestion();
    startTimer();
  }

  function finishGame() {
    if (!state.isPlaying) return;
    state.isPlaying = false;
    clearInterval(state.timerId);
    clearTimeout(state.advanceTimeoutId);

    const total = state.correctCount + state.wrongCount;
    const accuracy = total > 0 ? Math.round((state.correctCount / total) * 100) : 0;

    let isNewRecord = false;
    if (state.score > state.bestScore) {
      saveBestScore(state.score);
      isNewRecord = true;
    }

    resScore.textContent = String(state.score);
    resCorrect.textContent = `${state.correctCount}/${total}`;
    resAccuracy.textContent = `${accuracy}%`;
    resStreak.textContent = String(state.bestStreak);
    newRecordBadge.classList.toggle("is-hidden", !isNewRecord);

    if (accuracy >= 90 && state.correctCount >= 8) {
      resultEmoji.textContent = "🏆";
      resultMessage.textContent = "Incrível! Você é um gênio das contas!";
    } else if (accuracy >= 70 && state.correctCount >= 4) {
      resultEmoji.textContent = "🌟";
      resultMessage.textContent = "Mandou muito bem! Ótimo raciocínio!";
    } else if (total === 0) {
      resultEmoji.textContent = "👋";
      resultMessage.textContent = "Partida encerrada. Que tal tentar uma rodada?";
    } else {
      resultEmoji.textContent = "💪";
      resultMessage.textContent = "Bom treino! Continue praticando para bater o recorde!";
    }

    playTone("finish");
    showScreen("result");
  }

  // Event listeners for setup choices
  document.querySelectorAll("[data-group]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.dataset.group;
      const value = btn.dataset.value;
      state[group] = value;

      document.querySelectorAll(`[data-group="${group}"]`).forEach((sibling) => {
        sibling.classList.toggle("is-selected", sibling === btn);
      });
    });
  });

  soundToggleBtn.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;
    updateSoundUI();
    try {
      localStorage.setItem(STORAGE_KEY_SOUND, String(state.soundEnabled));
    } catch {
      // Ignore storage errors
    }
  });

  startBtn.addEventListener("click", startGame);
  playAgainBtn.addEventListener("click", startGame);
  quitBtn.addEventListener("click", finishGame);
  changeSettingsBtn.addEventListener("click", () => showScreen("setup"));

  optionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      handleAnswer(Number(btn.dataset.value), btn);
    });
  });

  typeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const raw = answerInput.value.trim();
    if (raw === "") return;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;
    handleAnswer(parsed);
  });

  document.addEventListener("keydown", (event) => {
    if (!state.isPlaying || state.inputMode !== "options" || state.isLocked) return;
    const idx = ["1", "2", "3", "4"].indexOf(event.key);
    if (idx !== -1 && optionButtons[idx]) {
      event.preventDefault();
      handleAnswer(Number(optionButtons[idx].dataset.value), optionButtons[idx]);
    }
  });

  loadPreferences();
})();
