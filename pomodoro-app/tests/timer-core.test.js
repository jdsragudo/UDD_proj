const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/timer-core.js');

test('sanitizeSettings clamps invalid values and preserves valid defaults', () => {
  const sanitized = Core.sanitizeSettings({
    focusMinutes: 999,
    shortBreakMinutes: -5,
    longBreakInterval: 1,
    theme: 'unknown',
  });
  assert.equal(sanitized.focusMinutes, 120);
  assert.equal(sanitized.shortBreakMinutes, 1);
  assert.equal(sanitized.longBreakInterval, 2);
  assert.equal(sanitized.theme, 'matcha');
  assert.equal(sanitized.longBreakMinutes, 15);
});

test('formatTime formats mm:ss with zero padding and ceiling rounding', () => {
  assert.equal(Core.formatTime(0), '00:00');
  assert.equal(Core.formatTime(5), '00:05');
  assert.equal(Core.formatTime(1500), '25:00');
  assert.equal(Core.formatTime(61.2), '01:02');
});

test('getNextModeAfterCompletion transitions through short breaks and long break after interval', () => {
  const settings = { ...Core.DEFAULT_SETTINGS, longBreakInterval: 4 };

  const step1 = Core.getNextModeAfterCompletion(Core.MODES.FOCUS, 0, settings);
  assert.deepEqual(step1, { nextMode: Core.MODES.SHORT_BREAK, nextCompletedFocusInCycle: 1 });

  const step2 = Core.getNextModeAfterCompletion(Core.MODES.SHORT_BREAK, 1, settings);
  assert.deepEqual(step2, { nextMode: Core.MODES.FOCUS, nextCompletedFocusInCycle: 1 });

  const step4 = Core.getNextModeAfterCompletion(Core.MODES.FOCUS, 3, settings);
  assert.deepEqual(step4, { nextMode: Core.MODES.LONG_BREAK, nextCompletedFocusInCycle: 0 });
});

test('computeRemainingMs handles running vs paused states accurately', () => {
  const running = { isRunning: true, remainingMs: 5000, endTimeMs: 10000 };
  assert.equal(Core.computeRemainingMs(running, 7500), 2500);
  assert.equal(Core.computeRemainingMs(running, 12000), 0);

  const paused = { isRunning: false, remainingMs: 4200, endTimeMs: null };
  assert.equal(Core.computeRemainingMs(paused, 999999), 4200);
});

test('createTask and recordCompletedSession track intentions and 7-day history', () => {
  assert.equal(Core.createTask('   ', 2), null);
  const task = Core.createTask('Write design notes', 3, 't1');
  assert.equal(task.id, 't1');
  assert.equal(task.estimatedPomodoros, 3);
  assert.equal(task.completedPomodoros, 0);

  const refDate = new Date(2026, 10, 21, 12, 0, 0);
  const history = Core.recordCompletedSession({}, Core.MODES.FOCUS, 25, refDate);
  const summary = Core.getLast7DaysSummary(history, refDate);
  assert.equal(summary.length, 7);
  assert.equal(summary[6].isToday, true);
  assert.equal(summary[6].focusSessions, 1);
  assert.equal(summary[6].focusMinutes, 25);
});
