'use strict';

/**
 * coros-mcp.js
 * Remote MCP server exposing Coros activity data to Claude.
 *
 * Uses Node built-in https — no external dependencies.
 * Authenticates with the Coros web API (US/EN region) using
 * COROS_EMAIL + COROS_PASSWORD environment variables.
 * Web API only — phone app is never affected.
 *
 * Connect in Claude.ai: Settings > Connectors > Add custom connector
 * URL: https://workout-tracker-backend-production-c138.up.railway.app/coros-mcp
 */

const https = require('https');
const crypto = require('crypto');
const express = require('express');

const router = express.Router();

// ─── Coros API Constants ──────────────────────────────────────────────────────

const COROS_BASE = 'https://teamapi.coros.com'; // US/global endpoint
const APP_ID = 'coros-webv2';

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

function httpsRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apptype': '5',
        'appversion': '2.8.1',
        ...options.headers,
      },
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Coros Auth (singleton with token caching) ────────────────────────────────

let _token = null;
let _loginPromise = null;

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

async function login() {
  const email = process.env.COROS_EMAIL;
  const password = process.env.COROS_PASSWORD;

  if (!email || !password) {
    throw new Error('COROS_EMAIL and COROS_PASSWORD environment variables are required');
  }

  console.log('[Coros MCP] Authenticating...');

  const res = await httpsRequest(
    `${COROS_BASE}/account/login`,
    { method: 'POST' },
    {
      account: email,
      accountType: 2, // email login
      pwd: md5(password),
      appId: APP_ID,
    }
  );

  if (res.status !== 200 || res.data?.result !== '0000') {
    throw new Error(`Coros login failed: ${JSON.stringify(res.data)}`);
  }

  _token = res.data.data?.accessToken || res.data.accessToken;
  if (!_token) throw new Error('No access token in Coros login response');

  console.log('[Coros MCP] Authenticated successfully');
  return _token;
}

async function getToken() {
  if (_token) return _token;
  if (_loginPromise) return _loginPromise;
  _loginPromise = login().finally(() => { _loginPromise = null; });
  return _loginPromise;
}

function resetToken() {
  _token = null;
  _loginPromise = null;
}

function authHeaders() {
  return { 'accesstoken': _token };
}

// ─── Coros API Calls ──────────────────────────────────────────────────────────

async function fetchActivities(size = 5) {
  const token = await getToken();
  const url = `${COROS_BASE}/activity/query?size=${size}&pageNumber=1`;
  const res = await httpsRequest(url, { headers: authHeaders() });

  if (res.status === 401 || res.data?.result === '1003') {
    resetToken();
    throw new Error('unauthorized');
  }
  if (res.data?.result !== '0000') {
    throw new Error(`Coros API error: ${JSON.stringify(res.data)}`);
  }

  return res.data?.data?.dataList || res.data?.data || [];
}

async function fetchActivityDetail(activityId, sportType = '100') {
  const token = await getToken();
  const url = `${COROS_BASE}/activity/detail/query?labelId=${activityId}&sportType=${sportType}`;
  const res = await httpsRequest(url, { method: 'POST', headers: authHeaders() });

  if (res.status === 401 || res.data?.result === '1003') {
    resetToken();
    throw new Error('unauthorized');
  }
  if (res.data?.result !== '0000') {
    throw new Error(`Coros API error: ${JSON.stringify(res.data)}`);
  }

  return res.data?.data || null;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (!seconds) return 'unknown';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatDistance(meters) {
  if (!meters) return null;
  const miles = (meters / 1609.34).toFixed(2);
  const km = (meters / 1000).toFixed(2);
  return `${miles} mi (${km} km)`;
}

function formatPace(meters, seconds) {
  if (!meters || !seconds) return null;
  const secPerMile = seconds / (meters / 1609.34);
  const min = Math.floor(secPerMile / 60);
  const sec = Math.round(secPerMile % 60).toString().padStart(2, '0');
  return `${min}:${sec} /mi`;
}

function formatTimestamp(ts) {
  if (!ts) return 'unknown';
  const s = String(ts);
  // YYYYMMDDHHMMSS format from Coros
  if (s.length === 14) {
    return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
  }
  return new Date(Number(ts) * 1000).toLocaleString('en-US');
}

function formatActivity(a) {
  const lines = [];
  lines.push(`${a.sportName || a.name || 'Activity'} — ${formatTimestamp(a.startTime)}`);
  if (a.distance)     lines.push(`  Distance: ${formatDistance(a.distance)}`);
  if (a.totalTime)    lines.push(`  Duration: ${formatDuration(a.totalTime)}`);
  if (a.distance && a.totalTime) lines.push(`  Pace: ${formatPace(a.distance, a.totalTime)}`);
  if (a.avgHeartRate) lines.push(`  Avg HR: ${a.avgHeartRate} bpm`);
  if (a.maxHeartRate) lines.push(`  Max HR: ${a.maxHeartRate} bpm`);
  if (a.calorie)      lines.push(`  Calories: ${Math.round(a.calorie / 1000)} kcal`);
  if (a.trainingLoad) lines.push(`  Training Load: ${a.trainingLoad}`);
  if (a.elevationGain) lines.push(`  Elevation Gain: ${a.elevationGain}m`);
  lines.push(`  ID: ${a.labelId} | Sport type: ${a.sportType}`);
  return lines.join('\n');
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_recent_activities',
    description: "Get Dave's most recent Coros activities (runs, workouts, etc). Use when Dave asks about recent runs, how a run went, or wants a summary of recent training.",
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of recent activities to return (default: 5, max: 20)' },
      },
      required: [],
    },
  },
  {
    name: 'get_activity_detail',
    description: "Get full details for a specific Coros activity including lap splits. Use after get_recent_activities when Dave wants to dig into a specific run.",
    inputSchema: {
      type: 'object',
      properties: {
        activity_id: { type: 'string', description: 'The activity ID from get_recent_activities' },
        sport_type:  { type: 'string', description: 'Sport type from get_recent_activities (e.g. "100" for running)' },
      },
      required: ['activity_id'],
    },
  },
  {
    name: 'get_training_metrics',
    description: "Get a summary of Dave's recent training load, HR trends, and distance from recent Coros activities.",
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of recent activities to summarize (default: 10)' },
      },
      required: [],
    },
  },
];

// ─── Tool Execution ───────────────────────────────────────────────────────────

async function executeTool(name, args) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      switch (name) {

        case 'get_recent_activities': {
          const count = Math.min(args.count || 5, 20);
          const activities = await fetchActivities(count);
          if (!activities.length) return 'No recent activities found.';
          const lines = [`Dave's ${activities.length} most recent Coros activities:\n`];
          for (const a of activities) { lines.push(formatActivity(a)); lines.push(''); }
          return lines.join('\n');
        }

        case 'get_activity_detail': {
          if (!args.activity_id) throw new Error('activity_id is required');
          const detail = await fetchActivityDetail(args.activity_id, args.sport_type || '100');
          if (!detail) return 'Activity not found.';
          const lines = ['Activity Detail:\n', formatActivity(detail), ''];
          const laps = detail.lapList || detail.laps || [];
          if (laps.length) {
            lines.push(`Lap Splits (${laps.length} laps):`);
            laps.forEach((lap, i) => {
              const dist = lap.distance ? formatDistance(lap.distance) : '';
              const pace = (lap.distance && lap.time) ? formatPace(lap.distance, lap.time) : '';
              const hr   = lap.avgHeartRate ? `HR: ${lap.avgHeartRate} bpm` : '';
              lines.push(`  Lap ${i + 1}: ${[dist, pace, hr].filter(Boolean).join(' | ')}`);
            });
          }
          return lines.join('\n');
        }

        case 'get_training_metrics': {
          const count = Math.min(args.count || 10, 20);
          const activities = await fetchActivities(count);
          if (!activities.length) return 'No activity data found.';
          const runs = activities.filter(a => String(a.sportType).startsWith('1'));
          const totalLoad = activities.reduce((s, a) => s + (a.trainingLoad || 0), 0);
          const hrActivities = activities.filter(a => a.avgHeartRate);
          const avgHR = hrActivities.length
            ? Math.round(hrActivities.reduce((s, a) => s + a.avgHeartRate, 0) / hrActivities.length)
            : null;
          const totalDist = runs.reduce((s, a) => s + (a.distance || 0), 0);
          return [
            `Training Metrics (last ${activities.length} activities):\n`,
            `Total Activities: ${activities.length} (${runs.length} runs)`,
            `Total Running Distance: ${formatDistance(totalDist) || 'N/A'}`,
            `Total Training Load: ${totalLoad}`,
            avgHR ? `Avg Heart Rate: ${avgHR} bpm` : null,
            '',
            'Most recent activity:',
            formatActivity(activities[0]),
          ].filter(l => l !== null).join('\n');
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

    } catch (err) {
      if (err.message === 'unauthorized' && attempt === 0) {
        console.log('[Coros MCP] Token expired, re-authenticating...');
        resetToken();
        continue;
      }
      throw err;
    }
  }
}

// ─── MCP JSON-RPC Handler ─────────────────────────────────────────────────────

function ok(id, result)    { return { jsonrpc: '2.0', id, result }; }
function err(id, code, msg){ return { jsonrpc: '2.0', id, error: { code, message: msg } }; }

router.post('/', express.json(), async (req, res) => {
  const { jsonrpc, id, method, params } = req.body;
  if (jsonrpc !== '2.0') return res.json(err(id, -32600, 'Invalid JSON-RPC version'));

  try {
    if (method === 'initialize') {
      return res.json(ok(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'dave-coros', version: '1.0.0' },
      }));
    }
    if (method === 'tools/list') {
      return res.json(ok(id, { tools: TOOLS }));
    }
    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      if (!toolName) return res.json(err(id, -32602, 'Missing tool name'));
      console.log(`[Coros MCP] tools/call: ${toolName}`);
      const result = await executeTool(toolName, toolArgs);
      return res.json(ok(id, { content: [{ type: 'text', text: result }] }));
    }
    if (method === 'notifications/initialized') return res.status(204).send();
    return res.json(err(id, -32601, `Method not found: ${method}`));

  } catch (e) {
    console.error(`[Coros MCP] Error:`, e.message);
    return res.json(err(id, -32603, e.message));
  }
});

function registerCorosMcpRoutes(app) {
  app.use('/coros-mcp', router);
  console.log('[Coros MCP] Server registered at /coros-mcp');
}

module.exports = { registerCorosMcpRoutes };
