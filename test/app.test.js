'use strict';
/**
 * App tests: run the real index.html in a simulated browser.
 *  1. Unit checks on the weight parser and set display.
 *  2. A click-through smoke test of every screen, which fails on any error,
 *     any "Failed…" alert, or a Sync Error status.
 */
const { bootApp, flush } = require('./app-harness');

let app;
afterEach(() => { if (app) app.close(); app = null; });

// Every test ends by asserting the app stayed healthy
function expectHealthy(a) {
  expect(a.errors).toEqual([]);
  expect(a.alerts.filter(m => /fail|error/i.test(m))).toEqual([]);
  expect(a.syncText()).not.toMatch(/Sync Error/);
}

// ─── Weight parsing ──────────────────────────────────────────────────────────

describe('parseWeight', () => {
  beforeEach(async () => { app = await bootApp(); });
  const parse = (input, exercise = 'Test Exercise') => app.window.parseWeight(input, exercise);

  test.each([
    ['25', 25, 'lbs'],
    ['25 lbs', 25, 'lbs'],
    ['25 kg', 25, 'kg'],
    ['2x12 kg', 24, '2×12 kg'],
    ['2×12 kg', 24, '2×12 kg'],
    ['2 x 15 lb', 30, '2×15 lbs'],
    ['bw', 0, 'BW'],
    ['na', 0, 'NA'],
  ])('"%s" → %s %s', (input, weight, unit) => {
    const r = parse(input);
    expect(r.weight).toBe(weight);
    expect(r.unit).toBe(unit);
  });

  test.each([
    ['red', 'Red Band'],
    ['turquoise', 'Turquoise Band'],
    ['Turquoise band', 'Turquoise Band'],
    ['teal', 'Teal Band'],
    ['light blue', 'Light Blue Band'],
    ['hot pink', 'Hot Pink Band'],
    ['grey', 'Grey Band'],
    ['white', 'White Band'],
  ])('band "%s" → %s', (input, unit) => {
    expect(parse(input)).toEqual({ weight: 0, unit });
  });

  test('every band color in BAND_COLORS parses to its own band', () => {
    const colors = app.evaluate('BAND_COLORS');
    expect(colors.length).toBeGreaterThanOrEqual(40);
    for (const c of colors) {
      const expected = c.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') + ' Band';
      expect(parse(c).unit).toBe(expected);
    }
  });
});

// ─── Set display ─────────────────────────────────────────────────────────────

describe('formatWeight', () => {
  beforeEach(async () => { app = await bootApp(); });
  const fmt = (set, timed = false) => app.window.formatWeight(set, timed);

  test('regular weight', () => expect(fmt({ exercise: 'Face Pulls', reps: 10, weight: 20, unit: 'lbs' })).toBe('10 reps × 20 lbs'));
  test('doubled weight', () => expect(fmt({ exercise: 'Bench', reps: 10, weight: 40, unit: '2×20 lbs' })).toBe('10 reps @ 2×20 lbs'));
  test('band', () => expect(fmt({ exercise: 'Hip Abduction', reps: 8, weight: 0, unit: 'Turquoise Band' })).toBe('8 reps (Turquoise Band)'));
  test('bodyweight', () => expect(fmt({ exercise: 'Pushups', reps: 7, weight: 0, unit: 'BW' })).toBe('7 reps (BW)'));
  test('timed only', () => expect(fmt({ exercise: 'Ab Isometrics', reps: 10, weight: 0, unit: 'seconds' }, true)).toBe('10s'));
  test('suitcase carry, one hand', () => expect(fmt({ exercise: 'Suitcase Carry', reps: 60, weight: 12, unit: 'kg' }, true)).toBe('60s @ 12 kg'));
  test('suitcase carry, both hands', () => expect(fmt({ exercise: 'Suitcase Carry', reps: 45, weight: 24, unit: '2×12 kg' }, true)).toBe('45s @ 2×12 kg'));
  test('legacy KB hold rows get the 2× prefix', () => expect(fmt({ exercise: 'Bottoms Up KB Holds', reps: 45, weight: 8, unit: 'kg' }, true)).toBe('45s @ 2×8 kg'));
});

describe('timed exercise lists', () => {
  beforeEach(async () => { app = await bootApp(); });
  test.each(['Ab Isometrics', 'Ab Iso Work', 'Rope Shoulder Stretch'])('%s is seconds only', (name) => {
    expect(app.window.isTimedExercise(name)).toBe(true);
    expect(app.window.isTimedWithWeight(name)).toBe(false);
  });
  test.each(['Bottoms Up KB Holds', 'Suitcase Carry'])('%s is seconds + weight', (name) => {
    expect(app.window.isTimedWithWeight(name)).toBe(true);
  });
});

// ─── Click-through smoke test ────────────────────────────────────────────────

describe('smoke test: every screen', () => {
  beforeEach(async () => { app = await bootApp(); await flush(); });

  test('signs in, loads data, shows a version and Synced', () => {
    expect(app.document.querySelector('h1').textContent).toMatch(/v\d+\.\d+/);
    expect(app.evaluate('workoutLog.length')).toBeGreaterThan(0);
    expectHealthy(app);
  });

  test('every tab opens without errors', async () => {
    for (const tab of ['analysis', 'history', 'settings', 'log']) {
      app.clickTab(tab);
      await flush();
      expect(app.document.getElementById(tab).classList.contains('active')).toBe(true);
    }
    expectHealthy(app);
  });

  test('both workouts render every exercise card', async () => {
    for (const w of ['A', 'B']) {
      app.selectWorkout(w);
      await flush();
      const count = app.evaluate(`workouts['${w}'].length`);
      expect(app.document.querySelectorAll('.exercise-name').length).toBe(count);
    }
    expectHealthy(app);
  });

  test('history shows timed sets in seconds', async () => {
    app.clickTab('history');
    await flush();
    const text = app.document.getElementById('history').textContent;
    expect(text).toMatch(/60s @ 12 kg/);
    expect(text).toMatch(/45s @ 2×12 kg/);
    expect(text).toMatch(/18s/);
    expectHealthy(app);
  });

  test('analysis renders for every exercise in the dropdown', async () => {
    app.clickTab('analysis');
    await flush();
    const select = app.document.getElementById('exerciseSelect');
    const options = [...select.options].filter(o => o.value);
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      select.value = o.value;
      select.dispatchEvent(new app.window.Event('change'));
    }
    await flush();
    expectHealthy(app);
  });

  test('Reload from Sheet succeeds with no failure alert or Sync Error (v2.17.10 regression)', async () => {
    app.clickTab('settings');
    await flush();
    await app.window.reloadFromSheet();
    await flush();
    expect(app.alerts.some(m => /Successfully reloaded/.test(m))).toBe(true);
    expect(app.document.getElementById('settings').classList.contains('active')).toBe(true);
    expectHealthy(app);
  });
});

describe('smoke test: logging sets', () => {
  beforeEach(async () => {
    app = await bootApp();
    app.selectWorkout('A');
    await flush();
  });

  test('regular weight', async () => {
    const sent = await app.logSet('Goblet Squats', 10, '24 kg');
    expect(sent).toMatchObject({ exercise: 'Goblet Squats', reps: 10, weight: 24, unit: 'kg', workout: 'A' });
    expectHealthy(app);
  });

  test('turquoise band', async () => {
    const sent = await app.logSet('Hip Abduction', 8, 'turquoise');
    expect(sent).toMatchObject({ reps: 8, weight: 0, unit: 'Turquoise Band' });
    expectHealthy(app);
  });

  test('suitcase carry, both hands, in seconds', async () => {
    const sent = await app.logSet('Suitcase Carry', 60, '2x12 kg');
    expect(sent).toMatchObject({ reps: 60, weight: 24, unit: '2×12 kg' });
    await flush();
    const card = app.document.getElementById(`logged-${app.cardIndex('Suitcase Carry')}`);
    expect(card.textContent).toMatch(/60s @ 2×12 kg/);
    expectHealthy(app);
  });

  test('rope shoulder stretch is seconds only (weight box disabled)', async () => {
    const idx = app.cardIndex('Rope Shoulder Stretch');
    expect(app.document.getElementById(`weight-${idx}`).disabled).toBe(true);
    const sent = await app.logSet('Rope Shoulder Stretch', 20);
    expect(sent).toMatchObject({ reps: 20, weight: 0, unit: 'seconds' });
    expectHealthy(app);
  });

  test('undo removes the last set', async () => {
    await app.logSet('Goblet Squats', 10, '24 kg');
    const before = app.evaluate('workoutLog.length');
    await app.window.undoLastSet();
    await flush();
    expect(app.evaluate('workoutLog.length')).toBe(before - 1);
    expect(app.requests.some(r => r.path.endsWith('/delete-row'))).toBe(true);
    expectHealthy(app);
  });
});
