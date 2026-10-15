'use strict';
/**
 * Post-deploy checks against the LIVE app and Railway backend.
 *
 *   node scripts/verify-live.js --baseline   # before pushing: record set count + MCP tools
 *   node scripts/verify-live.js              # after pushing: confirm the deploy is healthy
 *
 * Checks:
 *  1. GitHub Pages serves the same version as local index.html (waits up to ~5 min)
 *  2. Railway /summary/health is "ready"
 *  3. /workout-data returns data, and total sets did not drop vs the baseline
 *  4. Both MCP servers still list all their tools
 *
 * Uses curl so it works through proxies, on a Mac, and in GitHub Actions.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FRONTEND = 'https://extraface.github.io/workout-tracker-backend/';
const BACKEND = 'https://workout-tracker-backend-production-c138.up.railway.app';
const EXPECTED_TOOLS = {
  mcp: ['get_recent_workouts', 'get_personal_records', 'get_exercise_history', 'get_full_summary'],
  'coros-mcp': ['get_recent_activities', 'get_activity_detail', 'get_training_metrics',
                'get_activities_by_date_range', 'get_activities_by_type', 'debug_raw_activity']
};
const root = path.join(__dirname, '..');
const BASELINE_FILE = path.join(root, '.live-baseline.json');
const VERSION_RE = /v(\d+\.\d+(?:\.\d+)*)<\/span><\/h1>/;

function curl(url, { method = 'GET', body } = {}) {
  const args = ['-sS', '--max-time', '30', '-X', method, url];
  if (body) args.push('-H', 'Content-Type: application/json', '-H', 'Accept: application/json, text/event-stream', '-d', JSON.stringify(body));
  return execFileSync('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

const sleep = (ms) => execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`]);

function totalSets() {
  const text = curl(`${BACKEND}/workout-data`);
  const m = text.match(/Total sets logged \(all time\): (\d+)/);
  if (!m) throw new Error('workout-data did not include "Total sets logged"');
  return parseInt(m[1], 10);
}

function toolNames(server) {
  const res = JSON.parse(curl(`${BACKEND}/${server}`, { method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } }));
  return (res.result && res.result.tools || []).map(t => t.name);
}

const results = [];
function record(name, fn) {
  try {
    const detail = fn();
    results.push({ ok: true, name, detail });
  } catch (err) {
    results.push({ ok: false, name, detail: err.message });
  }
}

// ── Baseline mode ──
if (process.argv.includes('--baseline')) {
  const baseline = { takenAt: new Date().toISOString(), totalSets: totalSets(), tools: {} };
  for (const s of Object.keys(EXPECTED_TOOLS)) baseline.tools[s] = toolNames(s);
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
  console.log(`Baseline saved: ${baseline.totalSets} sets; tools: ${Object.entries(baseline.tools).map(([k, v]) => `${k}=${v.length}`).join(', ')}`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : null;
const localVersion = (fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(VERSION_RE) || [])[1];

// 1. Frontend version (GitHub Pages can take a few minutes)
record(`App is live at v${localVersion}`, () => {
  let live;
  for (let i = 0; i < 20; i++) {
    live = (curl(`${FRONTEND}?nc=${Date.now()}`).match(VERSION_RE) || [])[1];
    if (live === localVersion) return `GitHub Pages serves v${live}`;
    sleep(15000);
  }
  throw new Error(`GitHub Pages still serves v${live}, expected v${localVersion}`);
});

// 2. Backend health
record('Railway backend healthy', () => {
  const h = JSON.parse(curl(`${BACKEND}/summary/health`));
  if (h.status !== 'ready') throw new Error(`health status is "${h.status}"`);
  return 'status ready';
});

// 3. Data intact
record('Workout data intact', () => {
  const n = totalSets();
  if (baseline && n < baseline.totalSets) throw new Error(`total sets dropped: ${baseline.totalSets} → ${n}`);
  return baseline ? `${n} sets (baseline ${baseline.totalSets})` : `${n} sets (no baseline recorded)`;
});

// 4. MCP tools
for (const [server, expected] of Object.entries(EXPECTED_TOOLS)) {
  record(`MCP /${server} tools`, () => {
    const names = toolNames(server);
    const required = new Set([...expected, ...((baseline && baseline.tools[server]) || [])]);
    const missing = [...required].filter(t => !names.includes(t));
    if (missing.length) throw new Error(`missing: ${missing.join(', ')}`);
    return `${names.length} tools`;
  });
}

console.log('Live checks');
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name} — ${r.detail}`);
if (results.some(r => !r.ok)) process.exit(1);
