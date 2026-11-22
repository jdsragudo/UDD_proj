(function () {
  'use strict';

  const Core = window.KomorebiCore;
  const AudioEngine = window.CalmAudioEngine;

  const STORAGE_KEYS = {
    SETTINGS: 'komorebi_settings_v1',
    TASKS: 'komorebi_tasks_v1',
    ACTIVE_TASK: 'komorebi_active_task_v1',
    HISTORY: 'komorebi_history_v1',
  };

  const QUOTES = [
    '“Do one thing at a time, slowly and with full attention.”',
    '“Calmness is the cradle of power.”',
    '“Quiet progress compounds faster than hurried noise.”',
    '“Breathe in clarity; exhale everything outside this moment.”',
    '“Rest is part of the rhythm, not an interruption of it.”',
    '“Small, steady intervals build work you are proud of.”',
  ];

  const PHASE_LABELS = {
    [Core.MODES.FOCUS]: 'Deep Focus',
    [Core.MODES.SHORT_BREAK]: 'Gentle Rest',
    [Core.MODES.LONG_BREAK]: 'Long Pause',
  };

  const RING_RADIUS = 130;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  const audio = new AudioEngine();

  let settings = Core.sanitizeSettings(loadJson(STORAGE_KEYS.SETTINGS, Core.DEFAULT_SETTINGS));
  let tasks = loadJson(STORAGE_KEYS.TASKS, []);
  if (!Array.isArray(tasks)) tasks = [];
  let activeTaskId = loadJson(STORAGE_KEYS.ACTIVE_TASK, null);
  let history = loadJson(STORAGE_KEYS.HISTORY, {});
  if (!history || typeof history !== 'object') history = {};

  let timerState = {
    mode: Core.MODES.FOCUS,
    isRunning: false,
    remainingMs: Core.getDurationSeconds(Core.MODES.FOCUS, settings) * 1000,
    totalMs: Core.getDurationSeconds(Core.MODES.FOCUS, settings) * 1000,
    endTimeMs: null,
    completedFocusInCycle: 0,
  };

  let estDraft = 1;
  let quoteIndex = 0;
  let tickInterval = null;
  let isZenMode = false;
  let isMuted = false;

  // DOM Elements
  const el = {
    appShell: document.getElementById('appShell'),
    modeTabs: Array.from(document.querySelectorAll('.mode-tab')),
    themeDots: Array.from(document.querySelectorAll('.theme-dot')),
    zenToggleBtn: document.getElementById('zenToggleBtn'),
    muteBtn: document.getElementById('muteBtn'),
    soundOnIcon: document.querySelector('.icon-sound-on'),
    soundOffIcon: document.querySelector('.icon-sound-off'),
    settingsBtn: document.getElementById('settingsBtn'),
    activeIntentionText: document.getElementById('activeIntentionText'),
    timerRingWrapper: document.getElementById('timerRingWrapper'),
    ringProgress: document.getElementById('ringProgress'),
    phaseCaption: document.getElementById('phaseCaption'),
    timerDisplay: document.getElementById('timerDisplay'),
    cycleDots: document.getElementById('cycleDots'),
    startPauseBtn: document.getElementById('startPauseBtn'),
    startPauseLabel: document.getElementById('startPauseLabel'),
    resetBtn: document.getElementById('resetBtn'),
    skipBtn: document.getElementById('skipBtn'),
    ambientChips: Array.from(document.querySelectorAll('#ambientChips .chip')),
    ambientVolumeSlider: document.getElementById('ambientVolumeSlider'),
    quoteBtn: document.getElementById('quoteBtn'),
    quoteText: document.getElementById('quoteText'),
    todayDateLabel: document.getElementById('todayDateLabel'),
    statSessions: document.getElementById('statSessions'),
    statMinutes: document.getElementById('statMinutes'),
    statCycle: document.getElementById('statCycle'),
    weekChart: document.getElementById('weekChart'),
    taskForm: document.getElementById('taskForm'),
    taskInput: document.getElementById('taskInput'),
    estDecBtn: document.getElementById('estDecBtn'),
    estIncBtn: document.getElementById('estIncBtn'),
    estValue: document.getElementById('estValue'),
    taskList: document.getElementById('taskList'),
    emptyTasks: document.getElementById('emptyTasks'),
    clearCompletedBtn: document.getElementById('clearCompletedBtn'),
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    settingsForm: document.getElementById('settingsForm'),
    settingFocusMin: document.getElementById('settingFocusMin'),
    settingShortMin: document.getElementById('settingShortMin'),
    settingLongMin: document.getElementById('settingLongMin'),
    settingInterval: document.getElementById('settingInterval'),
    settingAutoBreaks: document.getElementById('settingAutoBreaks'),
    settingAutoFocus: document.getElementById('settingAutoFocus'),
    settingChimeEnabled: document.getElementById('settingChimeEnabled'),
    settingChimeVol: document.getElementById('settingChimeVol'),
    testChimeBtn: document.getElementById('testChimeBtn'),
    settingNotifications: document.getElementById('settingNotifications'),
    resetDefaultsBtn: document.getElementById('resetDefaultsBtn'),
    toastBanner: document.getElementById('toastBanner'),
  };

  let toastTimer = null;
  function showToast(message) {
    el.toastBanner.textContent = message;
    el.toastBanner.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toastBanner.classList.add('hidden');
    }, 3200);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    el.themeDots.forEach((dot) => {
      dot.classList.toggle('active', dot.dataset.themeChoice === theme);
    });
  }

  function applyModeAppearance() {
    document.documentElement.setAttribute('data-mode', timerState.mode);
    el.modeTabs.forEach((tab) => {
      const isActive = tab.dataset.mode === timerState.mode;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
    el.phaseCaption.textContent = PHASE_LABELS[timerState.mode];
  }

  function renderCycleDots() {
    const total = settings.longBreakInterval;
    el.cycleDots.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('span');
      dot.className = 'cycle-dot';
      if (i < timerState.completedFocusInCycle) {
        dot.classList.add('done');
      } else if (i === timerState.completedFocusInCycle && timerState.mode === Core.MODES.FOCUS) {
        dot.classList.add('current');
      }
      el.cycleDots.appendChild(dot);
    }
  }

  function renderTimer() {
    const remainingMs = Core.computeRemainingMs(timerState, Date.now());
    const remainingSec = Math.ceil(remainingMs / 1000);
    const formatted = Core.formatTime(remainingSec);

    el.timerDisplay.textContent = formatted;
    document.title = `${formatted} • ${PHASE_LABELS[timerState.mode]} — Komorebi`;

    const fraction = timerState.totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / timerState.totalMs)) : 1;
    el.ringProgress.style.strokeDasharray = `${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`;
    el.ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - fraction));

    el.timerRingWrapper.classList.toggle('running', timerState.isRunning);
    if (timerState.isRunning) {
      el.startPauseLabel.textContent = 'Pause';
    } else if (remainingMs < timerState.totalMs && remainingMs > 0) {
      el.startPauseLabel.textContent = 'Resume';
    } else {
      el.startPauseLabel.textContent = timerState.mode === Core.MODES.FOCUS ? 'Start Focus' : 'Start Break';
    }
  }

  function renderActiveIntention() {
    const active = tasks.find((t) => t.id === activeTaskId && !t.completed);
    if (active) {
      el.activeIntentionText.textContent = `Focusing on: ${active.title}`;
    } else {
      el.activeIntentionText.textContent = 'Select an intention from your list, or simply breathe & begin.';
    }
  }

  function renderStats() {
    const todayKey = Core.getDateKey(new Date());
    const todayStats = history[todayKey] || { focusSessions: 0, focusMinutes: 0 };

    el.statSessions.textContent = String(todayStats.focusSessions);
    el.statMinutes.textContent = `${todayStats.focusMinutes}m`;
    el.statCycle.textContent = `${Math.min(timerState.completedFocusInCycle + 1, settings.longBreakInterval)} / ${settings.longBreakInterval}`;

    const now = new Date();
    el.todayDateLabel.textContent = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    const last7 = Core.getLast7DaysSummary(history, now);
    const maxMinutes = Math.max(25, ...last7.map((d) => d.focusMinutes));

    el.weekChart.innerHTML = '';
    last7.forEach((day) => {
      const col = document.createElement('div');
      col.className = `day-col${day.isToday ? ' today' : ''}`;
      col.title = `${day.label}: ${day.focusMinutes} min (${day.focusSessions} sessions)`;

      const wrap = document.createElement('div');
      wrap.className = 'day-bar-wrap';

      const bar = document.createElement('div');
      bar.className = 'day-bar';
      const pct = day.focusMinutes > 0 ? Math.max(12, Math.round((day.focusMinutes / maxMinutes) * 100)) : 4;
      bar.style.height = `${pct}%`;

      const lbl = document.createElement('span');
      lbl.className = 'day-label';
      lbl.textContent = day.label;

      wrap.appendChild(bar);
      col.appendChild(wrap);
      col.appendChild(lbl);
      el.weekChart.appendChild(col);
    });
  }

  function renderTasks() {
    el.taskList.innerHTML = '';
    const hasCompleted = tasks.some((t) => t.completed);
    el.clearCompletedBtn.classList.toggle('hidden', !hasCompleted);
    el.emptyTasks.classList.toggle('hidden', tasks.length > 0);

    tasks.forEach((task) => {
      const li = document.createElement('li');
      const isFocused = task.id === activeTaskId && !task.completed;
      li.className = `task-item${task.completed ? ' done' : ''}${isFocused ? ' focused' : ''}`;

      const checkBtn = document.createElement('button');
      checkBtn.type = 'button';
      checkBtn.className = 'task-check';
      checkBtn.setAttribute('aria-label', task.completed ? 'Mark incomplete' : 'Mark complete');
      checkBtn.innerHTML = task.completed
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : '';
      checkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        task.completed = !task.completed;
        if (task.completed && activeTaskId === task.id) {
          const nextOpen = tasks.find((t) => !t.completed && t.id !== task.id);
          activeTaskId = nextOpen ? nextOpen.id : null;
          saveJson(STORAGE_KEYS.ACTIVE_TASK, activeTaskId);
        }
        saveJson(STORAGE_KEYS.TASKS, tasks);
        renderTasks();
        renderActiveIntention();
      });

      const body = document.createElement('div');
      body.className = 'task-body';

      const title = document.createElement('span');
      title.className = 'task-title';
      title.textContent = task.title;

      const meta = document.createElement('div');
      meta.className = 'task-meta';

      const dotsWrap = document.createElement('span');
      dotsWrap.className = 'task-dots';
      const totalDots = Math.max(task.estimatedPomodoros, task.completedPomodoros);
      for (let i = 0; i < totalDots; i++) {
        const d = document.createElement('span');
        d.className = `task-dot${i < task.completedPomodoros ? ' filled' : ''}`;
        dotsWrap.appendChild(d);
      }

      const countText = document.createElement('span');
      countText.textContent = `${task.completedPomodoros}/${task.estimatedPomodoros}`;

      meta.appendChild(dotsWrap);
      meta.appendChild(countText);
      body.appendChild(title);
      body.appendChild(meta);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'task-delete';
      delBtn.setAttribute('aria-label', 'Delete task');
      delBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        tasks = tasks.filter((t) => t.id !== task.id);
        if (activeTaskId === task.id) {
          activeTaskId = null;
          saveJson(STORAGE_KEYS.ACTIVE_TASK, activeTaskId);
        }
        saveJson(STORAGE_KEYS.TASKS, tasks);
        renderTasks();
        renderActiveIntention();
      });

      li.addEventListener('click', () => {
        if (task.completed) return;
        activeTaskId = activeTaskId === task.id ? null : task.id;
        saveJson(STORAGE_KEYS.ACTIVE_TASK, activeTaskId);
        renderTasks();
        renderActiveIntention();
      });

      li.appendChild(checkBtn);
      li.appendChild(body);
      li.appendChild(delBtn);
      el.taskList.appendChild(li);
    });
  }

  function stopTicking() {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
  }

  function notifyDesktop(title, body) {
    if (!settings.notificationsEnabled || typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body });
      } catch (_) {}
    }
  }

  function requestNotificationPermissionIfNeeded() {
    if (settings.notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  function switchMode(newMode, autoStart = false) {
    stopTicking();
    const durationMs = Core.getDurationSeconds(newMode, settings) * 1000;
    timerState.mode = newMode;
    timerState.isRunning = false;
    timerState.totalMs = durationMs;
    timerState.remainingMs = durationMs;
    timerState.endTimeMs = null;

    applyModeAppearance();
    renderCycleDots();
    renderStats();
    renderTimer();

    if (autoStart) {
      startTimer();
    }
  }

  function completeCurrentSession(wasSkipped = false) {
    stopTicking();
    const finishedMode = timerState.mode;

    if (!wasSkipped) {
      const durationMin = Math.round(timerState.totalMs / 60000);
      history = Core.recordCompletedSession(history, finishedMode, durationMin, new Date());
      saveJson(STORAGE_KEYS.HISTORY, history);

      if (finishedMode === Core.MODES.FOCUS && activeTaskId) {
        const task = tasks.find((t) => t.id === activeTaskId);
        if (task) {
          task.completedPomodoros += 1;
          saveJson(STORAGE_KEYS.TASKS, tasks);
          renderTasks();
        }
      }

      if (settings.chimeEnabled) {
        audio.playChime(finishedMode === Core.MODES.FOCUS ? 'focusComplete' : 'breakComplete');
      }

      if (finishedMode === Core.MODES.FOCUS) {
        showToast('Focus session complete — take a gentle breath.');
        notifyDesktop('Focus complete', 'Time for a restorative break.');
      } else {
        showToast('Break complete — ready when you are.');
        notifyDesktop('Break finished', 'Ready for your next focus session.');
      }
    }

    const transition = Core.getNextModeAfterCompletion(finishedMode, timerState.completedFocusInCycle, settings);
    timerState.completedFocusInCycle = transition.nextCompletedFocusInCycle;

    const shouldAutoStart = !wasSkipped && (
      transition.nextMode === Core.MODES.FOCUS ? settings.autoStartFocus : settings.autoStartBreaks
    );

    switchMode(transition.nextMode, shouldAutoStart);
  }

  function startTimer() {
    if (timerState.isRunning) return;
    requestNotificationPermissionIfNeeded();
    audio.ensureContext();

    if (timerState.remainingMs <= 0) {
      timerState.remainingMs = timerState.totalMs;
    }

    timerState.isRunning = true;
    timerState.endTimeMs = Date.now() + timerState.remainingMs;

    renderTimer();
    stopTicking();
    tickInterval = setInterval(() => {
      const rem = Core.computeRemainingMs(timerState, Date.now());
      timerState.remainingMs = rem;
      if (rem <= 0) {
        completeCurrentSession(false);
      } else {
        renderTimer();
      }
    }, 250);
  }

  function pauseTimer() {
    if (!timerState.isRunning) return;
    timerState.remainingMs = Core.computeRemainingMs(timerState, Date.now());
    timerState.isRunning = false;
    timerState.endTimeMs = null;
    stopTicking();
    renderTimer();
  }

  function resetTimer() {
    stopTicking();
    const durationMs = Core.getDurationSeconds(timerState.mode, settings) * 1000;
    timerState.isRunning = false;
    timerState.totalMs = durationMs;
    timerState.remainingMs = durationMs;
    timerState.endTimeMs = null;
    renderTimer();
  }

  function toggleZenMode() {
    isZenMode = !isZenMode;
    el.appShell.classList.toggle('zen-mode', isZenMode);
    el.zenToggleBtn.setAttribute('aria-pressed', String(isZenMode));
  }

  function toggleMute() {
    isMuted = !isMuted;
    el.muteBtn.setAttribute('aria-pressed', String(isMuted));
    el.soundOnIcon.classList.toggle('hidden', isMuted);
    el.soundOffIcon.classList.toggle('hidden', !isMuted);
    audio.setVolumes({ isMuted });
  }

  function openSettingsModal() {
    el.settingFocusMin.value = settings.focusMinutes;
    el.settingShortMin.value = settings.shortBreakMinutes;
    el.settingLongMin.value = settings.longBreakMinutes;
    el.settingInterval.value = settings.longBreakInterval;
    el.settingAutoBreaks.checked = settings.autoStartBreaks;
    el.settingAutoFocus.checked = settings.autoStartFocus;
    el.settingChimeEnabled.checked = settings.chimeEnabled;
    el.settingChimeVol.value = Math.round(settings.chimeVolume * 100);
    el.settingNotifications.checked = settings.notificationsEnabled;
    el.settingsModal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    el.settingsModal.classList.add('hidden');
  }

  // Event Bindings
  el.modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      switchMode(tab.dataset.mode, false);
    });
  });

  el.themeDots.forEach((dot) => {
    dot.addEventListener('click', () => {
      settings.theme = dot.dataset.themeChoice;
      saveJson(STORAGE_KEYS.SETTINGS, settings);
      applyTheme(settings.theme);
    });
  });

  el.startPauseBtn.addEventListener('click', () => {
    if (timerState.isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  });

  el.resetBtn.addEventListener('click', resetTimer);
  el.skipBtn.addEventListener('click', () => completeCurrentSession(true));
  el.zenToggleBtn.addEventListener('click', toggleZenMode);
  el.muteBtn.addEventListener('click', toggleMute);

  el.ambientChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      el.ambientChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      audio.setAmbient(chip.dataset.sound);
    });
  });

  el.ambientVolumeSlider.value = String(Math.round(settings.ambientVolume * 100));
  el.ambientVolumeSlider.addEventListener('input', (e) => {
    settings.ambientVolume = Number(e.target.value) / 100;
    audio.setVolumes({ ambientVolume: settings.ambientVolume });
    saveJson(STORAGE_KEYS.SETTINGS, settings);
  });

  el.quoteBtn.addEventListener('click', () => {
    quoteIndex = (quoteIndex + 1) % QUOTES.length;
    el.quoteText.textContent = QUOTES[quoteIndex];
  });

  el.estDecBtn.addEventListener('click', () => {
    estDraft = Math.max(1, estDraft - 1);
    el.estValue.textContent = String(estDraft);
  });

  el.estIncBtn.addEventListener('click', () => {
    estDraft = Math.min(12, estDraft + 1);
    el.estValue.textContent = String(estDraft);
  });

  el.taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const task = Core.createTask(el.taskInput.value, estDraft);
    if (!task) return;
    tasks.unshift(task);
    if (!activeTaskId) {
      activeTaskId = task.id;
      saveJson(STORAGE_KEYS.ACTIVE_TASK, activeTaskId);
    }
    saveJson(STORAGE_KEYS.TASKS, tasks);
    el.taskInput.value = '';
    estDraft = 1;
    el.estValue.textContent = '1';
    renderTasks();
    renderActiveIntention();
  });

  el.clearCompletedBtn.addEventListener('click', () => {
    tasks = tasks.filter((t) => !t.completed);
    saveJson(STORAGE_KEYS.TASKS, tasks);
    renderTasks();
    renderActiveIntention();
  });

  el.settingsBtn.addEventListener('click', openSettingsModal);
  el.closeSettingsBtn.addEventListener('click', closeSettingsModal);
  el.settingsModal.addEventListener('click', (e) => {
    if (e.target === el.settingsModal) closeSettingsModal();
  });

  el.testChimeBtn.addEventListener('click', () => {
    audio.setVolumes({ chimeVolume: Number(el.settingChimeVol.value) / 100, isMuted: false });
    audio.playChime('focusComplete');
  });

  el.resetDefaultsBtn.addEventListener('click', () => {
    settings = Core.sanitizeSettings({ ...Core.DEFAULT_SETTINGS, theme: settings.theme });
    saveJson(STORAGE_KEYS.SETTINGS, settings);
    openSettingsModal();
    if (!timerState.isRunning) {
      resetTimer();
    }
    renderCycleDots();
    renderStats();
  });

  el.settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    settings = Core.sanitizeSettings({
      ...settings,
      focusMinutes: el.settingFocusMin.value,
      shortBreakMinutes: el.settingShortMin.value,
      longBreakMinutes: el.settingLongMin.value,
      longBreakInterval: el.settingInterval.value,
      autoStartBreaks: el.settingAutoBreaks.checked,
      autoStartFocus: el.settingAutoFocus.checked,
      chimeEnabled: el.settingChimeEnabled.checked,
      chimeVolume: Number(el.settingChimeVol.value) / 100,
      notificationsEnabled: el.settingNotifications.checked,
    });
    saveJson(STORAGE_KEYS.SETTINGS, settings);
    audio.setVolumes({ chimeVolume: settings.chimeVolume, ambientVolume: settings.ambientVolume });
    if (!timerState.isRunning) {
      resetTimer();
    }
    renderCycleDots();
    renderStats();
    closeSettingsModal();
    showToast('Preferences saved.');
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;
    if (!el.settingsModal.classList.contains('hidden')) {
      if (e.key === 'Escape') closeSettingsModal();
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      timerState.isRunning ? pauseTimer() : startTimer();
    } else if (e.key.toLowerCase() === 'r') {
      resetTimer();
    } else if (e.key.toLowerCase() === 'z') {
      toggleZenMode();
    } else if (e.key.toLowerCase() === 'm') {
      toggleMute();
    }
  });

  // Initial render
  audio.setVolumes({
    chimeVolume: settings.chimeVolume,
    ambientVolume: settings.ambientVolume,
    isMuted,
  });
  applyTheme(settings.theme);
  applyModeAppearance();
  renderCycleDots();
  renderTimer();
  renderStats();
  renderTasks();
  renderActiveIntention();
}());
