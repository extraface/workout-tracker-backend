'use strict';
/**
 * Loads the real index.html in a simulated browser (jsdom) with a fake backend,
 * so tests can click through the app exactly like a person would.
 * Nothing here talks to Railway or Google Sheets.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SHEET_ID = '1mvQLF5tHtR_ivU_aKfyIX54irHlGZCvdlxqJAt8KHh0';

// Synthetic data shaped like real Sheet rows (no personal data in the public repo)
const CONFIG = {
  workoutA: ['Goblet Squats', 'Band Pullaparts Palms Down', 'Flat bench press*', 'Hip Abduction',
             'Suitcase Carry', 'Rope Shoulder Stretch', 'Ab Isometrics'],
  workoutB: ['Pushups', 'Swiss Ball TWMs', 'Face Pulls', 'Bottoms Up KB Holds', 'Kettlebell RDLs']
};

function row(daysAgo, workout, exercise, reps, weight, unit, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(7, minute, 0, 0);
  return { date: d.toISOString(), workout, exercise, reps, weight, unit, weightKg: 0, deload: '', deleted: '' };
}

function sampleRows() {
  const rows = [];
  // Two A sessions and two B sessions, oldest first, like the Sheet
  for (const days of [9, 2]) {
    rows.push(
      row(days, 'A', 'Goblet Squats', 10, 24, 'kg', 1),
      row(days, 'A', 'Goblet Squats', 10, 24, 'kg', 2),
      row(days, 'A', 'Band Pullaparts Palms Down', 10, 0, 'Green Band', 3),
      row(days, 'A', 'Flat bench press*', 10, 40, '2×20 lbs', 4),
      row(days, 'A', 'Hip Abduction', 8, 0, 'Turquoise Band', 5),
      row(days, 'A', 'Suitcase Carry', 60, 12, 'kg', 6),
      row(days, 'A', 'Suitcase Carry', 45, 24, '2×12 kg', 7),
      row(days, 'A', 'Rope Shoulder Stretch', 18, 0, 'BW', 8),
      row(days, 'A', 'Ab Isometrics', 10, 0, 'seconds', 9)
    );
  }
  for (const days of [7, 4]) {
    rows.push(
      row(days, 'B', 'Pushups', 7, 0, 'BW', 1),
      row(days, 'B', 'Swiss Ball TWMs', 10, 4, '2×2 lbs', 2),
      row(days, 'B', 'Face Pulls', 10, 20, 'lbs', 3),
      row(days, 'B', 'Bottoms Up KB Holds', 45, 16, '2×8 kg', 4),
      row(days, 'B', 'Kettlebell RDLs', 12, 24, 'kg', 5)
    );
  }
  return rows;
}

function jsonResponse(body, status = 200) {
  return { ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Error', json: async () => body };
}

/**
 * Boot the app signed in, with the fake backend serving `rows` and `config`.
 * Returns handles for interacting and for asserting nothing went wrong.
 */
async function bootApp({ rows = sampleRows(), config = CONFIG } = {}) {
  const alerts = [];
  const errors = [];
  const requests = [];
  let sheetRows = rows.slice();

  const dom = new JSDOM(HTML, {
    url: 'https://extraface.github.io/workout-tracker-backend/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.localStorage.setItem('sessionId', 'test-session');
      window.localStorage.setItem('spreadsheetId', SHEET_ID);
      window.alert = (msg) => alerts.push(String(msg));
      window.confirm = () => true;
      window.scrollTo = () => {};
      window.addEventListener('error', (e) => errors.push(e.error ? e.error.stack || e.error.message : e.message));
      window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason && e.reason.stack || e.reason)));
      const realError = window.console.error.bind(window.console);
      window.console.error = (...args) => { errors.push(args.map(a => (a && a.stack) || String(a)).join(' ')); };
      window.console.log = () => {};
      window.console.warn = () => {};
      void realError;

      window.fetch = async (url, opts = {}) => {
        const u = new URL(url);
        const method = (opts.method || 'GET').toUpperCase();
        const body = opts.body ? JSON.parse(opts.body) : undefined;
        requests.push({ method, path: u.pathname, body });

        if (u.pathname === '/auth/check') return jsonResponse({ authenticated: true });
        if (u.pathname === `/sheets/${SHEET_ID}/config`) return jsonResponse(config);
        if (u.pathname === `/sheets/${SHEET_ID}/data`) return jsonResponse({ workouts: sheetRows.slice() });
        if (u.pathname === `/sheets/${SHEET_ID}/entry` && method === 'POST') {
          sheetRows.push({ ...body, weightKg: 0, deleted: '' });
          return jsonResponse({ success: true });
        }
        if (u.pathname === `/sheets/${SHEET_ID}/delete-row`) return jsonResponse({ success: true });
        return jsonResponse({ error: `fake backend: no route for ${method} ${u.pathname}` }, 404);
      };
    }
  });

  const { window } = dom;
  await waitFor(() => window.document.querySelector('.tabs'), 'app to render after sign-in');

  const app = {
    window,
    document: window.document,
    alerts,
    errors,
    requests,
    /** Read or set a top-level `let` in the app (e.g. workoutLog). */
    evaluate: (code) => window.eval(code),
    clickTab(name) {
      const btn = [...window.document.querySelectorAll('.tab')].find(b => b.textContent.trim().toLowerCase() === name);
      if (!btn) throw new Error(`No tab named ${name}`);
      btn.click();
    },
    selectWorkout(letter) {
      const btn = window.document.getElementById(`workoutBtn${letter}`);
      if (!btn) throw new Error(`No workout button ${letter}`);
      btn.click();
    },
    /** Find the exercise card index by exercise name in the current workout. */
    cardIndex(exercise) {
      const names = window.eval(`workouts[currentWorkout]`);
      const idx = names.indexOf(exercise);
      if (idx === -1) throw new Error(`${exercise} not in current workout`);
      return idx;
    },
    async logSet(exercise, reps, weight) {
      const idx = app.cardIndex(exercise);
      window.document.getElementById(`reps-${idx}`).value = String(reps);
      const w = window.document.getElementById(`weight-${idx}`);
      if (weight !== undefined && !w.disabled) w.value = weight;
      const before = requests.length;
      [...window.document.querySelectorAll('button')]
        .find(b => (b.getAttribute('onclick') || '').startsWith(`logSet('${exercise.replace(/'/g, "\\'")}'`))
        .click();
      await waitFor(() => requests.slice(before).some(r => r.path.endsWith('/entry')), `set for ${exercise} to be sent`);
      return requests.slice(before).find(r => r.path.endsWith('/entry')).body;
    },
    syncText: () => (window.document.querySelector('.sync-status') || {}).textContent || '',
    close: () => window.close()
  };
  return app;
}

async function waitFor(fn, what, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = fn();
    if (v) return v;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const flush = () => new Promise(r => setTimeout(r, 50));

module.exports = { bootApp, sampleRows, CONFIG, waitFor, flush };
