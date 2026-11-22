(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KomorebiCore = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MODES = {
    FOCUS: 'focus',
    SHORT_BREAK: 'shortBreak',
    LONG_BREAK: 'longBreak',
  };

  const DEFAULT_SETTINGS = {
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    longBreakInterval: 4,
    autoStartBreaks: false,
    autoStartFocus: false,
    notificationsEnabled: true,
    chimeEnabled: true,
    chimeVolume: 0.65,
    ambientVolume: 0.35,
    theme: 'matcha',
  };

  function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, Math.round(num)));
  }

  function sanitizeSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const vol = Number(src.chimeVolume);
    const ambVol = Number(src.ambientVolume);
    const validThemes = ['matcha', 'dusk', 'coastal'];

    return {
      focusMinutes: clampNumber(src.focusMinutes, 1, 120, DEFAULT_SETTINGS.focusMinutes),
      shortBreakMinutes: clampNumber(src.shortBreakMinutes, 1, 60, DEFAULT_SETTINGS.shortBreakMinutes),
      longBreakMinutes: clampNumber(src.longBreakMinutes, 1, 90, DEFAULT_SETTINGS.longBreakMinutes),
      longBreakInterval: clampNumber(src.longBreakInterval, 2, 10, DEFAULT_SETTINGS.longBreakInterval),
      autoStartBreaks: Boolean(src.autoStartBreaks),
      autoStartFocus: Boolean(src.autoStartFocus),
      notificationsEnabled: src.notificationsEnabled !== undefined ? Boolean(src.notificationsEnabled) : DEFAULT_SETTINGS.notificationsEnabled,
      chimeEnabled: src.chimeEnabled !== undefined ? Boolean(src.chimeEnabled) : DEFAULT_SETTINGS.chimeEnabled,
      chimeVolume: Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : DEFAULT_SETTINGS.chimeVolume,
      ambientVolume: Number.isFinite(ambVol) ? Math.min(1, Math.max(0, ambVol)) : DEFAULT_SETTINGS.ambientVolume,
      theme: validThemes.includes(src.theme) ? src.theme : DEFAULT_SETTINGS.theme,
    };
  }

  function getDurationSeconds(mode, settings) {
    const s = sanitizeSettings(settings);
    switch (mode) {
      case MODES.SHORT_BREAK:
        return s.shortBreakMinutes * 60;
      case MODES.LONG_BREAK:
        return s.longBreakMinutes * 60;
      case MODES.FOCUS:
      default:
        return s.focusMinutes * 60;
    }
  }

  function formatTime(totalSeconds) {
    const safe = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function getDateKey(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function computeRemainingMs(timerState, nowMs) {
    if (!timerState.isRunning || !timerState.endTimeMs) {
      return Math.max(0, timerState.remainingMs);
    }
    return Math.max(0, timerState.endTimeMs - nowMs);
  }

  function getNextModeAfterCompletion(currentMode, completedFocusInCycle, settings) {
    const s = sanitizeSettings(settings);
    if (currentMode === MODES.FOCUS) {
      const nextCount = completedFocusInCycle + 1;
      if (nextCount >= s.longBreakInterval) {
        return {
          nextMode: MODES.LONG_BREAK,
          nextCompletedFocusInCycle: 0,
        };
      }
      return {
        nextMode: MODES.SHORT_BREAK,
        nextCompletedFocusInCycle: nextCount,
      };
    }
    return {
      nextMode: MODES.FOCUS,
      nextCompletedFocusInCycle: completedFocusInCycle,
    };
  }

  function createTask(title, estimatedPomodoros, id) {
    const trimmed = String(title || '').trim();
    if (!trimmed) return null;
    return {
      id: id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: trimmed.slice(0, 140),
      estimatedPomodoros: clampNumber(estimatedPomodoros, 1, 12, 1),
      completedPomodoros: 0,
      completed: false,
      createdAt: Date.now(),
    };
  }

  function recordCompletedSession(history, mode, durationMinutes, dateInput) {
    const safeHistory = history && typeof history === 'object' ? { ...history } : {};
    const key = getDateKey(dateInput);
    const prev = safeHistory[key] || { focusSessions: 0, focusMinutes: 0, breaks: 0 };

    if (mode === MODES.FOCUS) {
      safeHistory[key] = {
        focusSessions: prev.focusSessions + 1,
        focusMinutes: prev.focusMinutes + Math.max(1, Math.round(durationMinutes)),
        breaks: prev.breaks,
      };
    } else {
      safeHistory[key] = {
        focusSessions: prev.focusSessions,
        focusMinutes: prev.focusMinutes,
        breaks: prev.breaks + 1,
      };
    }
    return safeHistory;
  }

  function getLast7DaysSummary(history, referenceDate) {
    const ref = referenceDate instanceof Date ? new Date(referenceDate) : new Date();
    const safeHistory = history && typeof history === 'object' ? history : {};
    const days = [];
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(ref);
      d.setDate(ref.getDate() - i);
      const key = getDateKey(d);
      const entry = safeHistory[key] || { focusSessions: 0, focusMinutes: 0, breaks: 0 };
      days.push({
        dateKey: key,
        label: weekdayNames[d.getDay()],
        isToday: i === 0,
        focusSessions: entry.focusSessions || 0,
        focusMinutes: entry.focusMinutes || 0,
      });
    }
    return days;
  }

  return {
    MODES,
    DEFAULT_SETTINGS,
    sanitizeSettings,
    getDurationSeconds,
    formatTime,
    getDateKey,
    computeRemainingMs,
    getNextModeAfterCompletion,
    createTask,
    recordCompletedSession,
    getLast7DaysSummary,
  };
}));
