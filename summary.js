'use strict';

/**
 * summary.js
 * Workout summary endpoint logic for Claude/AI consumption.
 * 
 * All pure functions are exported for unit testing.
 * buildSummary() orchestrates everything and returns plain text.
 */

const crypto = require('crypto');
const { google } = require('googleapis');

// ─── Constants ───────────────────────────────────────────────────────────────

const SPREADSHEET_ID = process.env.SUMMARY_SPREADSHEET_ID;
const SUMMARY_API_KEY = process.env.SUMMARY_API_KEY;
const SHEET_RANGE = 'Workouts!A2:I';
const SHEET_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 5000; // 5 seconds

// Rate limiting: 30 requests per IP per minute
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60000;

const VALID_MODES = ['full', 'recent', 'prs', 'exercise'];
const NON_NUMERIC_UNITS = new Set(['BW', 'NA', 'bodyweight', 'n/a', 'seconds']);

// ─── In-memory cache (per param combination) ─────────────────────────────────

const summaryCache = new Map();

function getCacheKey(params) {
  return `${params.mode}|${params.months || ''}|${params.since || ''}|${params.deload || ''}|${params.name || ''}|${params.sessions || ''}`;
}

function getCached(params) {
  if (params.bust) return null; // bypass cache entirely
  const key = getCacheKey(params);
  const entry = summaryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    summaryCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(params, data) {
  summaryCache.set(getCacheKey(params), { data, timestamp: Date.now() });
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

const rateLimitLog = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const requests = (rateLimitLog.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (requests.length >= RATE_LIMIT_MAX) {
    return false;
  }
  requests.push(now);
  rateLimitLog.set(ip, requests);
  return true;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Verify API key using timing-safe comparison.
 * Hashes both sides to handle variable-length inputs safely.
 */
function verifyApiKey(provided) {
  if (!provided || !SUMMARY_API_KEY) return false;
  const hashProvided = crypto.createHash('sha256').update(String(provided)).digest();
  const hashExpected = crypto.createHash('sha256').update(String(SUMMARY_API_KEY)).digest();
  return crypto.timingSafeEqual(hashProvided, hashExpected);
}

/**
 * Parse and validate the service account JSON from env.
 * Returns { auth, error }.
 */
function getServiceAccountAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    return { auth: null, error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { auth: null, error: 'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON' };
  }
  if (!parsed || parsed.type !== 'service_account' || !parsed.client_email || !parsed.private_key) {
    return { auth: null, error: 'GOOGLE_SERVICE_ACCOUNT_JSON is missing required fields (type, client_email, private_key)' };
  }
  const auth = new google.auth.GoogleAuth({
    credentials: parsed,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  return { auth, error: null };
}

// ─── Parameter validation ─────────────────────────────────────────────────────

/**
 * Parse and validate query parameters.
 * Returns { params, error } where error is a string or null.
 */
function parseParams(query) {
  const mode = query.mode || 'full';
  if (!VALID_MODES.includes(mode)) {
    return { params: null, error: `Invalid mode "${mode}". Must be one of: ${VALID_MODES.join(', ')}` };
  }

  if (mode === 'exercise' && !query.name) {
    return { params: null, error: 'mode=exercise requires a "name" parameter (e.g. &name=Cable+Fly)' };
  }

  let months = null;
  if (query.months !== undefined) {
    months = parseInt(query.months, 10);
    if (isNaN(months) || months < 1 || months > 120) {
      return { params: null, error: 'months must be an integer between 1 and 120' };
    }
  }

  let sessions = 10;
  if (query.sessions !== undefined) {
    sessions = parseInt(query.sessions, 10);
    if (isNaN(sessions) || sessions < 1 || sessions > 50) {
      return { params: null, error: 'sessions must be an integer between 1 and 50' };
    }
  }

  let since = null;
  if (query.since) {
    const d = new Date(query.since);
    if (isNaN(d.getTime())) {
      return { params: null, error: `Invalid since date "${query.since}". Use format YYYY-MM-DD` };
    }
    since = d;
  }

  let deload = null;
  if (query.deload !== undefined) {
    if (!['exclude', 'only'].includes(query.deload)) {
      return { params: null, error: 'deload must be "exclude" or "only"' };
    }
    deload = query.deload;
  }

  // since wins over months if both provided
  let cutoffDate = null;
  if (since) {
    cutoffDate = since;
  } else if (months) {
    cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);
  }

  return {
    params: {
      mode,
      months,
      sessions,
      since,
      deload,
      cutoffDate,
      name: query.name ? String(query.name).trim() : null,
      bust: query.bust === '1' || query.bust === 'true'
    },
    error: null
  };
}

// ─── Data parsing ─────────────────────────────────────────────────────────────

const LBS_TO_KG = 0.453592;

function convertToKg(weight, unit) {
  const u = (unit || '').toLowerCase();
  if (u.includes('kg')) return weight;
  if (u.includes('lb')) return weight * LBS_TO_KG;
  return 0;
}

/**
 * Parse a doubled-weight unit like "2×25 lbs" → weight=25, unit="lbs"
 * Returns null if not a doubled-weight format.
 */
function parseDoubledWeight(weight, unit) {
  // Unit like "2×25 lbs" or weight field with multiplier
  const unitMatch = String(unit || '').match(/^(\d+)[×x](\d+(?:\.\d+)?)\s*(lbs?|kgs?|kg|lb)$/i);
  if (unitMatch) {
    return { weight: parseFloat(unitMatch[2]), unit: unitMatch[3] };
  }
  return null;
}

/**
 * Convert raw sheet rows to clean entry objects.
 * Skips rows with unparseable dates.
 */
function parseSheetsData(rows) {
  const entries = [];
  for (const row of (rows || [])) {
    const date = new Date(row[0]);
    if (isNaN(date.getTime())) continue; // skip malformed dates

    let weight = parseFloat(row[4]) || 0;
    let unit = row[5] || '';
    const weightKg = parseFloat(row[6]) || convertToKg(weight, unit);

    entries.push({
      date,
      workout: row[1] || '',
      exercise: (row[2] || '').trim(),
      reps: parseInt(row[3], 10) || 0,
      weight,
      unit,
      weightKg: Math.round(weightKg * 10000) / 10000, // 4dp precision
      deload: row[7] || '',
      deleted: row[8] || ''
    });
  }
  return entries;
}

// ─── Filtering ────────────────────────────────────────────────────────────────

function filterActive(entries) {
  return entries.filter(e => e.deleted !== 'Yes');
}

function applyParamFilters(entries, params) {
  let filtered = filterActive(entries);

  // Date cutoff
  if (params.cutoffDate) {
    filtered = filtered.filter(e => e.date >= params.cutoffDate);
  }

  // Deload filter
  if (params.deload === 'exclude') {
    filtered = filtered.filter(e => e.deload !== 'Yes');
  } else if (params.deload === 'only') {
    filtered = filtered.filter(e => e.deload === 'Yes');
  }

  // Exercise filter (for exercise mode)
  if (params.name) {
    filtered = filtered.filter(e => e.exercise.toLowerCase() === params.name.toLowerCase());
  }

  return filtered;
}

// ─── Session grouping ─────────────────────────────────────────────────────────

/**
 * Group entries by calendar date + workout type into sessions.
 * Returns array of session objects, sorted newest first.
 */
function groupBySession(entries) {
  const sessionMap = new Map();

  for (const entry of entries) {
    const dateStr = entry.date.toDateString();
    const key = `${dateStr}__${entry.workout}`;
    if (!sessionMap.has(key)) {
      sessionMap.set(key, {
        date: entry.date,
        dateStr,
        workout: entry.workout,
        isDeload: entry.deload === 'Yes',
        sets: []
      });
    }
    const session = sessionMap.get(key);
    session.sets.push(entry);
    if (entry.deload === 'Yes') session.isDeload = true;
  }

  return Array.from(sessionMap.values())
    .sort((a, b) => b.date - a.date);
}

// ─── PR computation ───────────────────────────────────────────────────────────

function isNumericUnit(unit) {
  const u = (unit || '').trim();
  if (!u) return false;
  if (NON_NUMERIC_UNITS.has(u)) return false;
  if (u.toLowerCase().includes('band')) return false;
  if (u.toLowerCase().includes('seconds')) return false;
  return true;
}

/**
 * Compute all-time PRs per exercise.
 * PR = highest weightKg, then most reps at that weight.
 * Respects deload filter from params.
 * Returns Map<exerciseName, { reps, weight, unit, weightKg, date }>
 */
function computePRs(entries) {
  const prMap = new Map();

  for (const entry of entries) {
    if (!isNumericUnit(entry.unit)) continue;
    if (entry.weight <= 0) continue;

    // Handle doubled weight display units
    const doubled = parseDoubledWeight(entry.weight, entry.unit);
    const effectiveWeight = doubled ? doubled.weight : entry.weight;
    const effectiveUnit = doubled ? doubled.unit : entry.unit;
    const effectiveKg = Math.round(convertToKg(effectiveWeight, effectiveUnit) * 10000) / 10000;

    const existing = prMap.get(entry.exercise);
    if (!existing) {
      prMap.set(entry.exercise, {
        reps: entry.reps,
        weight: effectiveWeight,
        unit: effectiveUnit,
        weightKg: effectiveKg,
        date: entry.date
      });
      continue;
    }

    if (effectiveKg > existing.weightKg) {
      prMap.set(entry.exercise, {
        reps: entry.reps,
        weight: effectiveWeight,
        unit: effectiveUnit,
        weightKg: effectiveKg,
        date: entry.date
      });
    } else if (effectiveKg === existing.weightKg && entry.reps > existing.reps) {
      prMap.set(entry.exercise, {
        ...existing,
        reps: entry.reps,
        date: entry.date
      });
    }
  }

  return prMap;
}

// ─── Exercise history ─────────────────────────────────────────────────────────

/**
 * For each exercise, compute: total sets, sessions count, last 5 session summaries, trend.
 */
function computeExerciseHistory(entries) {
  const exerciseMap = new Map();

  for (const entry of entries) {
    if (!exerciseMap.has(entry.exercise)) {
      exerciseMap.set(entry.exercise, []);
    }
    exerciseMap.get(entry.exercise).push(entry);
  }

  const history = [];

  for (const [exercise, sets] of exerciseMap.entries()) {
    const sessions = groupBySession(sets);
    const totalSets = sets.length;
    const totalSessions = sessions.length;

    // Last 5 sessions summary
    const last5 = sessions.slice(0, 5).map(s => {
      const reps = s.sets.map(e => e.reps);
      const weights = s.sets.map(e => e.weight).filter(w => w > 0);
      const avgReps = Math.round(reps.reduce((a, b) => a + b, 0) / reps.length);
      const maxWeight = weights.length > 0 ? Math.max(...weights) : null;
      const unit = s.sets.find(e => e.weight > 0)?.unit || '';
      const dateLabel = s.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return maxWeight
        ? `${dateLabel}: ${s.sets.length}×${avgReps} @ ${maxWeight} ${unit}`
        : `${dateLabel}: ${s.sets.length}×${avgReps}`;
    });

    // Trend: compare avg reps of last 3 sessions vs prior 3
    const trend = computeTrend(sessions);

    history.push({ exercise, totalSets, totalSessions, last5, trend });
  }

  return history.sort((a, b) => a.exercise.localeCompare(b.exercise));
}

function computeTrend(sessions) {
  if (sessions.length < 4) return 'insufficient data';
  const avgReps = (sessionList) => {
    const allReps = sessionList.flatMap(s => s.sets.map(e => e.reps));
    return allReps.reduce((a, b) => a + b, 0) / allReps.length;
  };
  const recent = avgReps(sessions.slice(0, 3));
  const prior = avgReps(sessions.slice(3, 6));
  if (prior === 0) return 'insufficient data';
  const pct = ((recent - prior) / prior) * 100;
  if (pct > 5) return `↑ improving (+${pct.toFixed(0)}%)`;
  if (pct < -5) return `↓ declining (${pct.toFixed(0)}%)`;
  return '→ stable';
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSessionSets(session) {
  const byExercise = new Map();
  for (const entry of session.sets) {
    if (!byExercise.has(entry.exercise)) byExercise.set(entry.exercise, []);
    byExercise.get(entry.exercise).push(entry);
  }

  const lines = [];
  for (const [exercise, sets] of byExercise.entries()) {
    const setSummaries = sets.map(e => {
      if (e.weight > 0 && isNumericUnit(e.unit)) {
        return `${e.reps}×${e.weight} ${e.unit}`;
      } else if (e.unit && e.unit !== 'NA') {
        return `${e.reps} reps (${e.unit})`;
      } else {
        return `${e.reps} reps`;
      }
    });
    lines.push(`  ${exercise}: ${setSummaries.join(', ')}`);
  }
  return lines.join('\n');
}

function formatSummaryText(data, params, allEntries) {
  const { mode, sessions: sessionCount } = params;
  const lines = [];
  const now = new Date();

  lines.push('WORKOUT SUMMARY');
  lines.push(`Generated: ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`);

  const activeAll = filterActive(allEntries);
  const firstEntry = activeAll.length > 0 ? activeAll.reduce((a, b) => a.date < b.date ? a : b) : null;
  lines.push(`Total sets logged (all time): ${activeAll.length}`);
  if (firstEntry) lines.push(`Tracking since: ${formatDate(firstEntry.date)}`);

  if (params.cutoffDate) {
    lines.push(`Filtered to: ${params.since ? `since ${formatDate(params.since)}` : `last ${params.months} months`}`);
  }
  if (params.deload) lines.push(`Deload sessions: ${params.deload === 'exclude' ? 'excluded' : 'only'}`);
  if (params.name) lines.push(`Exercise filter: ${params.name}`);

  lines.push('');

  // ── Recent Sessions ──
  if (mode === 'full' || mode === 'recent') {
    lines.push('═══════════════════════════════════════');
    lines.push(`RECENT SESSIONS (last ${sessionCount})`);
    lines.push('═══════════════════════════════════════');

    if (data.sessions.length === 0) {
      lines.push('No sessions found for the given filters.');
    } else {
      for (const session of data.sessions) {
        const deloadTag = session.isDeload ? ' — DELOAD' : '';
        lines.push(`\n${formatDate(session.date)} (Workout ${session.workout}) — ${session.sets.length} sets${deloadTag}`);
        lines.push(formatSessionSets(session));
      }
    }
    lines.push('');
  }

  // ── PRs ──
  if (mode === 'full' || mode === 'prs') {
    lines.push('═══════════════════════════════════════');
    lines.push('ALL-TIME PERSONAL RECORDS');
    if (params.cutoffDate) lines.push(`(within selected time window)`);
    lines.push('═══════════════════════════════════════');

    if (data.prs.size === 0) {
      lines.push('No numeric weight PRs found.');
    } else {
      const sorted = Array.from(data.prs.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [exercise, pr] of sorted) {
        const pad = ' '.repeat(Math.max(0, 30 - exercise.length));
        lines.push(`${exercise}${pad}${pr.reps} reps × ${pr.weight} ${pr.unit}  (${formatDate(pr.date)})`);
      }
    }
    lines.push('');
  }

  // ── Exercise History ──
  if (mode === 'full') {
    lines.push('═══════════════════════════════════════');
    lines.push('EXERCISE HISTORY');
    lines.push('═══════════════════════════════════════');

    if (data.history.length === 0) {
      lines.push('No exercise history found.');
    } else {
      for (const ex of data.history) {
        lines.push(`\n${ex.exercise} — ${ex.totalSets} sets across ${ex.totalSessions} sessions`);
        lines.push(`  Trend: ${ex.trend}`);
        if (ex.last5.length > 0) {
          lines.push(`  Last sessions:`);
          for (const s of ex.last5) lines.push(`    ${s}`);
        }
      }
    }
    lines.push('');
  }

  // ── Exercise deep dive ──
  if (mode === 'exercise') {
    lines.push('═══════════════════════════════════════');
    lines.push(`EXERCISE DEEP DIVE: ${params.name}`);
    lines.push('═══════════════════════════════════════');

    if (data.history.length === 0) {
      lines.push(`No data found for "${params.name}".`);
      lines.push('Note: exercise name must match exactly (case-insensitive).');
    } else {
      const ex = data.history[0];
      lines.push(`Total sets: ${ex.totalSets} across ${ex.totalSessions} sessions`);
      lines.push(`Trend: ${ex.trend}`);

      if (data.prs.size > 0) {
        const pr = data.prs.values().next().value;
        lines.push(`PR: ${pr.reps} reps × ${pr.weight} ${pr.unit} (${formatDate(pr.date)})`);
      }

      lines.push('\nAll sessions (newest first):');
      for (const session of data.sessions) {
        const deloadTag = session.isDeload ? ' [DELOAD]' : '';
        lines.push(`\n  ${formatDate(session.date)} (Workout ${session.workout})${deloadTag}`);
        for (const entry of session.sets) {
          const weightStr = entry.weight > 0 && isNumericUnit(entry.unit)
            ? ` @ ${entry.weight} ${entry.unit}` : entry.unit ? ` (${entry.unit})` : '';
          lines.push(`    ${entry.reps} reps${weightStr}`);
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Fetch raw rows from Google Sheets using service account auth.
 */
async function fetchSheetData(auth) {
  const sheets = google.sheets({ version: 'v4', auth });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHEET_TIMEOUT_MS);

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_RANGE,
      signal: controller.signal
    });
    return response.data.values || [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Main entry point. Fetches data, applies filters, computes summary.
 * Returns plain text string.
 */
async function buildSummary(params) {
  // Check cache first
  const cached = getCached(params);
  if (cached) return cached;

  // Get service account auth
  const { auth, error: authError } = getServiceAccountAuth();
  if (authError) throw new Error(`SERVICE_ACCOUNT_ERROR: ${authError}`);

  // Fetch all data
  const rows = await fetchSheetData(auth);
  const allEntries = parseSheetsData(rows);

  // Apply filters for this request
  const filtered = applyParamFilters(allEntries, params);

  // Compute what's needed for this mode
  const sessions = groupBySession(filtered).slice(0, params.sessions);
  const prs = (params.mode === 'full' || params.mode === 'prs' || params.mode === 'exercise')
    ? computePRs(filtered)
    : new Map();
  const history = (params.mode === 'full' || params.mode === 'exercise')
    ? computeExerciseHistory(filtered)
    : [];

  const data = { sessions, prs, history };
  const text = formatSummaryText(data, params, allEntries);

  setCache(params, text);
  return text;
}

// ─── Express route handler ────────────────────────────────────────────────────

/**
 * Register summary routes on an Express app.
 */
function registerRoutes(app) {

  // Health check — no key required, no sensitive data exposed
  app.get('/summary/health', (req, res) => {
    const { auth, error } = getServiceAccountAuth();
    const credentialsConfigured = !error;
    const spreadsheetConfigured = !!SPREADSHEET_ID;
    const apiKeyConfigured = !!SUMMARY_API_KEY;

    res.json({
      status: credentialsConfigured && spreadsheetConfigured && apiKeyConfigured ? 'ready' : 'not_ready',
      credentials: credentialsConfigured ? 'configured' : 'not_configured',
      spreadsheet: spreadsheetConfigured ? 'configured' : 'not_configured',
      api_key: apiKeyConfigured ? 'configured' : 'not_configured',
      setup_needed: !credentialsConfigured
        ? 'Add GOOGLE_SERVICE_ACCOUNT_JSON to Railway environment variables'
        : null
    });
  });

  // Main summary endpoint
  // Keyless endpoint for Claude AI fetch access (workout data is not sensitive)
  app.get('/workout-data', async (req, res) => {
    const start = Date.now();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Too many requests. Limit: 30 per minute.' });
    }

    const { params, error: paramError } = parseParams(req.query);
    if (paramError) {
      return res.status(400).json({ error: paramError });
    }

    try {
      const text = await buildSummary(params);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('X-Generated-At', new Date().toISOString());
      console.log(`[workout-data] 200 mode=${params.mode} ip=${ip} ms=${Date.now() - start}`);
      return res.send(text);
    } catch (err) {
      console.error(`[workout-data] 500 ms=${Date.now() - start}`, err.message);
      return res.status(500).json({ error: 'An unexpected error occurred.' });
    }
  });

  app.get('/summary', async (req, res) => {
    const start = Date.now();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    // Rate limit
    if (!checkRateLimit(ip)) {
      console.log(`[summary] 429 rate_limit ip=${ip} ms=${Date.now() - start}`);
      return res.status(429).json({ error: 'Too many requests. Limit: 30 per minute.' });
    }

    // Auth
    if (!verifyApiKey(req.query.key)) {
      console.log(`[summary] 401 bad_key ip=${ip} ms=${Date.now() - start}`);
      return res.status(401).json({ error: 'Invalid or missing API key. Add ?key=YOUR_KEY to the URL.' });
    }

    // Validate params
    const { params, error: paramError } = parseParams(req.query);
    if (paramError) {
      console.log(`[summary] 400 bad_params ip=${ip} error="${paramError}" ms=${Date.now() - start}`);
      return res.status(400).json({ error: paramError });
    }

    // Build summary
    try {
      const text = await buildSummary(params);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('X-Generated-At', new Date().toISOString());
      res.setHeader('X-Cache', getCached(params) ? 'HIT' : 'MISS');
      console.log(`[summary] 200 mode=${params.mode} ip=${ip} ms=${Date.now() - start}`);
      return res.send(text);
    } catch (err) {
      const ms = Date.now() - start;
      if (err.message && err.message.startsWith('SERVICE_ACCOUNT_ERROR:')) {
        console.error(`[summary] 503 service_account_error ms=${ms}`);
        return res.status(503).json({
          error: 'Summary endpoint not fully configured yet.',
          detail: 'GOOGLE_SERVICE_ACCOUNT_JSON environment variable is missing or invalid.',
          next_step: 'See setup instructions — a Google Service Account JSON key is required.'
        });
      }
      if (err.code === 'ECONNABORTED' || err.name === 'AbortError') {
        console.error(`[summary] 503 sheet_timeout ms=${ms}`);
        return res.status(503).json({ error: 'Google Sheets request timed out. Try again in a moment.' });
      }
      // Unexpected error — log details internally, return sanitized message
      console.error(`[summary] 500 unexpected_error ms=${ms}`, err.message);
      return res.status(500).json({ error: 'An unexpected error occurred. Check Railway logs for details.' });
    }
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  registerRoutes,
  buildSummary,
  parseParams,
  // Pure functions exported for testing:
  parseSheetsData,
  filterActive,
  applyParamFilters,
  groupBySession,
  computePRs,
  computeExerciseHistory,
  computeTrend,
  formatSummaryText,
  parseParams,
  verifyApiKey,
  checkRateLimit,
  isNumericUnit,
  parseDoubledWeight,
  getCacheKey,
};
