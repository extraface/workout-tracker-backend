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
    ['15 k', 15, 'kg'],
    ['20 pounds', 20, 'lbs'],
    ['16+8 kg', 24, 'kg (16 kg + 8 kg)'],
    ['16 kg + 8 kg', 24, 'kg (16 kg + 8 kg)'],
    ['16 + 8kg', 24, 'kg (16 kg + 8 kg)'],
    ['35+20 lb', 55, 'lbs (35 lbs + 20 lbs)'],
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

  test("replays Nov 17: 2x15 lbs, 2 x 20, undo, typo 2 x 20z, 2 x 20", async () => {
    const ex = 'Flat bench press*';
    expect(await app.logSet(ex, 10, '2x15 lbs')).toMatchObject({ weight: 30, unit: '2×15 lbs' });
    expect(await app.logSet(ex, 10, '2 x 20')).toMatchObject({ weight: 40, unit: '2×20 lbs' });
    await app.window.undoLastSet();
    await flush();

    // The typo is refused: no set is sent, the text stays for correcting
    const idx = app.cardIndex(ex);
    const before = app.requests.filter(r => r.path.endsWith('/entry')).length;
    app.document.getElementById(`reps-${idx}`).value = '10';
    app.document.getElementById(`weight-${idx}`).value = '2 x 20z';
    await app.window.logSet(ex, idx);
    await flush();
    expect(app.requests.filter(r => r.path.endsWith('/entry')).length).toBe(before);
    expect(app.alerts.some(m => /Can't read "2 x 20z"/.test(m))).toBe(true);
    expect(app.document.getElementById(`weight-${idx}`).value).toBe('2 x 20z');

    expect(await app.logSet(ex, 10, '2 x 20')).toMatchObject({ weight: 40, unit: '2×20 lbs' });
  });

  test('suitcase carry, both hands, in seconds', async () => {
    const sent = await app.logSet('Suitcase Carry', 60, '2x12 kg');
    expect(sent).toMatchObject({ reps: 60, weight: 24, unit: '2×12 kg' });
    await flush();
    const card = app.document.getElementById(`logged-${app.cardIndex('Suitcase Carry')}`);
    expect(card.textContent).toMatch(/60s @ 2×12 kg/);
    expectHealthy(app);
  });

  test('offset carry load (16+8 kg) logs the total and the split', async () => {
    const sent = await app.logSet('Suitcase Carry', 55, '16+8 kg');
    expect(sent).toMatchObject({ reps: 55, weight: 24, unit: 'kg (16 kg + 8 kg)' });
    await flush();
    const idx = app.cardIndex('Suitcase Carry');
    expect(app.document.getElementById(`logged-${idx}`).textContent).toMatch(/55s @ 24 kg \(16 kg \+ 8 kg\)/);
    // The next set is pre-filled the way it was typed
    expect(app.document.getElementById(`weight-${idx}`).value).toBe('16+8 kg');
    expectHealthy(app);
  });

  test('unreadable weight (typo "2 x 20z") is refused, not guessed', () => {
    expect(app.window.parseWeight('2 x 20z', 'Test Exercise')).toMatchObject({ invalid: true });
    expect(app.window.parseWeight('abc', 'Test Exercise')).toMatchObject({ invalid: true });
  });

  test('units do not pile up across doubled sets (2×15 lbs → 2 x 20 → 20)', () => {
    const ex = 'Neutral Grip Bench Press';
    expect(app.window.parseWeight('2x15 lbs', ex)).toEqual({ weight: 30, unit: '2×15 lbs' });
    expect(app.window.parseWeight('2 x 20', ex)).toEqual({ weight: 40, unit: '2×20 lbs' });
    expect(app.window.parseWeight('2 x 20', ex)).toEqual({ weight: 40, unit: '2×20 lbs' });
    expect(app.window.parseWeight('20', ex)).toEqual({ weight: 20, unit: 'lbs' });
    expect(app.window.parseWeight('2x12 kg', ex)).toEqual({ weight: 24, unit: '2×12 kg' });
    expect(app.window.parseWeight('2x10', ex)).toEqual({ weight: 20, unit: '2×10 kg' });
  });

  test('Offset Carry is timed with weight', () => {
    expect(app.window.isTimedWithWeight('Offset Carry')).toBe(true);
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

// ─── Access code (replaces Google sign-in) ───────────────────────────────────

describe('access code', () => {
  const { VALID_TOKEN, waitFor } = require('./app-harness');

  test('every backend call carries the stored access code', async () => {
    app = await bootApp();
    await flush();
    expect(app.requests.length).toBeGreaterThan(0);
    expect(app.requests.every(r => r.token === VALID_TOKEN)).toBe(true);
    expectHealthy(app);
  });

  test('a new device asks for the code once, then opens the tracker', async () => {
    app = await bootApp({ token: null });
    const doc = app.document;
    expect(doc.body.textContent).not.toMatch(/didn't work/);
    doc.getElementById('accessCode').value = VALID_TOKEN;
    app.window.saveAccessCode();
    await waitFor(() => doc.querySelector('.tabs'), 'tracker after entering the code');
    expect(app.window.localStorage.getItem('appToken')).toBe(VALID_TOKEN);
    expectHealthy(app);
  });

  test('a wrong code is rejected and not saved', async () => {
    app = await bootApp({ token: null });
    app.document.getElementById('accessCode').value = 'nope';
    app.window.saveAccessCode();
    await waitFor(() => /didn't work/.test(app.document.body.textContent), 'rejection message');
    expect(app.window.localStorage.getItem('appToken')).toBeNull();
  });

  test('sign out forgets the code', async () => {
    app = await bootApp();
    await flush();
    await app.window.logout();
    expect(app.window.localStorage.getItem('appToken')).toBeNull();
    expect(app.document.getElementById('accessCode')).not.toBeNull();
  });
});
