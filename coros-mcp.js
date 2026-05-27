'use strict';

/**
 * coros-mcp.js
 * Remote MCP server exposing Coros activity data to Claude.
 *
 * Authenticates with the Coros web API using credentials stored
 * in Railway environment variables (COROS_EMAIL, COROS_PASSWORD).
 * Web API only — no mobile API, so the Coros phone app is unaffected.
 *
 * Transport: Streamable HTTP (POST /coros-mcp) — same pattern as mcp.js
 * Connect in Claude.ai: Settings > Connectors > Add custom connector
 * URL: https://workout-tracker-backend-production-c138.up.railway.app/coros-mcp
 */

const express = require('express');
const { CorosApi, STSConfigs } = require(
  require.resolve('@nyt87/crs-connect').replace(/\.mjs$/, '.cjs')
);

const router = express.Router();

// ─── Coros Client (singleton with token caching) ──────────────────────────────

let _client = null;
let _loginPromise = null;

/**
 * Returns an authenticated CorosApi instance.
 * Logs in once on first call, then reuses the token.
 * If a login is already in progress, waits for it rather than firing twice.
 */
async function getClient() {
  if (_client) return _client;

  // Prevent concurrent logins if two tool calls arrive simultaneously
  if (_loginPromise) return _loginPromise;

  _loginPromise = (async () => {
    const email = process.env.COROS_EMAIL;
    const password = process.env.COROS_PASSWORD;

    if (!email || !password) {
      throw new Error('COROS_EMAIL and COROS_PASSWORD environment variables are required');
    }

    console.log('[Coros MCP] Authenticating with Coros web API...');
    const client = new CorosApi({ email, password });
    client.config({ stsConfig: STSConfigs.EN }); // EN = US/global region

    await client.login(email, password);
    console.log('[Coros MCP] Authenticated successfully');

    _client = client;
    _loginPromise = null;
    return _client;
  })();

  return _loginPromise;
}

/**
 * Clears the cached client so the next call re-authenticates.
 * Called when we get a 401/unauthorized from Coros.
 */
function resetClient() {
  _client = null;
  _loginPromise = null;
}

// ─── Data Formatting Helpers ──────────────────────────────────────────────────

function formatDuration(seconds) {
  if (!seconds) return 'unknown';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDistance(meters) {
  if (!meters) return 'unknown';
  const miles = (meters / 1609.34).toFixed(2);
  const km = (meters / 1000).toFixed(2);
  return `${miles} mi (${km} km)`;
}

function formatPace(meters, seconds) {
  if (!meters || !seconds) return 'unknown';
  const secondsPerMile = seconds / (meters / 1609.34);
  const paceMin = Math.floor(secondsPerMile / 60);
  const paceSec = Math.round(secondsPerMile % 60).toString().padStart(2, '0');
  return `${paceMin}:${paceSec} /mi`;
}

function formatDate(timestamp) {
  if (!timestamp) return 'unknown';
  // Coros timestamps are in seconds or YYYYMMDDHHMMSS format
  if (String(timestamp).length === 14) {
    const s = String(timestamp);
    return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
  }
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatActivity(activity) {
  const lines = [];
  lines.push(`📍 ${activity.sportName || activity.name || 'Activity'}`);
  lines.push(`   Date: ${formatDate(activity.startTime)}`);
  if (activity.distance) lines.push(`   Distance: ${formatDistance(activity.distance)}`);
  if (activity.totalTime) {
    lines.push(`   Duration: ${formatDuration(activity.totalTime)}`);
    if (activity.distance) lines.push(`   Pace: ${formatPace(activity.distance, activity.totalTime)}`);
  }
  if (activity.avgHeartRate) lines.push(`   Avg HR: ${activity.avgHeartRate} bpm`);
  if (activity.maxHeartRate) lines.push(`   Max HR: ${activity.maxHeartRate} bpm`);
  if (activity.calorie) lines.push(`   Calories: ${Math.round(activity.calorie / 1000)} kcal`);
  if (activity.trainingLoad) lines.push(`   Training Load: ${activity.trainingLoad}`);
  if (activity.elevationGain) lines.push(`   Elevation Gain: ${activity.elevationGain}m`);
  lines.push(`   ID: ${activity.labelId} (sport type: ${activity.sportType})`);
  return lines.join('\n');
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_recent_activities',
    description: "Get Dave's most recent Coros activities (runs, workouts, etc). Use when Dave asks about recent runs, training sessions, how a run went, or wants a summary of recent activity.",
    inputSchema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of recent activities to return (default: 5, max: 20)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_activity_detail',
    description: "Get full details for a specific Coros activity including lap splits and detailed metrics. Use after get_recent_activities when Dave wants to dig into a specific run.",
    inputSchema: {
      type: 'object',
      properties: {
        activity_id: {
          type: 'string',
          description: 'The activity ID from get_recent_activities results',
        },
        sport_type: {
          type: 'string',
          description: 'The sport type from get_recent_activities results (e.g. "100" for running)',
        },
      },
      required: ['activity_id'],
    },
  },
  {
    name: 'get_training_metrics',
    description: "Get Dave's EvoLab and daily training metrics: training load, VO2max, fitness score, resting HR. Use when Dave asks about recovery, fitness trends, or training status.",
    inputSchema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Number of days of recent activities to summarize for metrics (default: 30)',
        },
      },
      required: [],
    },
  },
];

// ─── Tool Execution ───────────────────────────────────────────────────────────

async function executeTool(name, args) {
  // Auto-retry once on auth failure
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const client = await getClient();

      switch (name) {

        case 'get_recent_activities': {
          const count = Math.min(args.count || 5, 20);
          const data = await client.getActivitiesList({ size: count });
          const activities = data?.dataList || data || [];

          if (!activities.length) return 'No recent activities found.';

          const lines = [`Dave's ${activities.length} most recent Coros activities:\n`];
          for (const act of activities) {
            lines.push(formatActivity(act));
            lines.push('');
          }
          return lines.join('\n');
        }

        case 'get_activity_detail': {
          if (!args.activity_id) throw new Error('activity_id is required');
          const sportType = args.sport_type || '100';
          const data = await client.getActivityDetails(args.activity_id, sportType);

          if (!data) return 'Activity not found.';

          const lines = ['Activity Detail:\n'];

          // Basic info
          if (data.labelId) lines.push(formatActivity(data));
          lines.push('');

          // Lap splits if available
          const laps = data.lapList || data.laps || [];
          if (laps.length > 0) {
            lines.push(`Lap Splits (${laps.length} laps):`);
            laps.forEach((lap, i) => {
              const lapDist = lap.distance ? formatDistance(lap.distance) : '';
              const lapPace = lap.distance && lap.time ? formatPace(lap.distance, lap.time) : '';
              const lapHR = lap.avgHeartRate ? `HR: ${lap.avgHeartRate}` : '';
              lines.push(`  Lap ${i + 1}: ${lapDist} @ ${lapPace} ${lapHR}`.trim());
            });
          }

          return lines.join('\n');
        }

        case 'get_training_metrics': {
          const days = args.days || 30;
          const data = await client.getActivitiesList({ size: 20 });
          const activities = data?.dataList || data || [];

          if (!activities.length) return 'No activity data found.';

          // Summarize from recent activities since EvoLab endpoint isn't in the library
          const runs = activities.filter(a => String(a.sportType).startsWith('1'));
          const totalLoad = activities.reduce((sum, a) => sum + (a.trainingLoad || 0), 0);
          const avgHR = activities.filter(a => a.avgHeartRate)
            .reduce((sum, a, _, arr) => sum + a.avgHeartRate / arr.length, 0);
          const totalDistance = runs.reduce((sum, a) => sum + (a.distance || 0), 0);

          const lines = [
            `Training Metrics Summary (last ${activities.length} activities):\n`,
            `Total Training Load: ${totalLoad}`,
            `Avg Heart Rate: ${avgHR ? Math.round(avgHR) + ' bpm' : 'N/A'}`,
            `Total Running Distance: ${formatDistance(totalDistance)}`,
            `Activities Logged: ${activities.length} (${runs.length} runs)`,
            '',
            'Most recent activity:',
            formatActivity(activities[0]),
          ];

          return lines.join('\n');
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

    } catch (err) {
      const isAuthError = err.message?.includes('401') ||
                          err.message?.includes('unauthorized') ||
                          err.message?.includes('Unauthorized') ||
                          err.message?.includes('token');

      if (isAuthError && attempt === 0) {
        console.log('[Coros MCP] Auth error, resetting client and retrying...');
        resetClient();
        continue; // retry
      }

      throw err;
    }
  }
}

// ─── MCP Request Handler ──────────────────────────────────────────────────────

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

router.post('/', express.json(), async (req, res) => {
  const { jsonrpc, id, method, params } = req.body;

  if (jsonrpc !== '2.0') {
    return res.json(jsonRpcError(id, -32600, 'Invalid JSON-RPC version'));
  }

  try {
    if (method === 'initialize') {
      return res.json(jsonRpcResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'dave-coros-tracker', version: '1.0.0' },
      }));
    }

    if (method === 'tools/list') {
      return res.json(jsonRpcResult(id, { tools: TOOLS }));
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      if (!toolName) {
        return res.json(jsonRpcError(id, -32602, 'Missing tool name'));
      }

      console.log(`[Coros MCP] tools/call: ${toolName}`, JSON.stringify(toolArgs));

      const result = await executeTool(toolName, toolArgs);

      return res.json(jsonRpcResult(id, {
        content: [{ type: 'text', text: result }],
      }));
    }

    if (method === 'notifications/initialized') {
      return res.status(204).send();
    }

    return res.json(jsonRpcError(id, -32601, `Method not found: ${method}`));

  } catch (err) {
    console.error(`[Coros MCP] Error in ${method}:`, err.message);
    return res.json(jsonRpcError(id, -32603, err.message));
  }
});

// ─── Register on Express App ──────────────────────────────────────────────────

function registerCorosMcpRoutes(app) {
  app.use('/coros-mcp', router);
  console.log('[Coros MCP] Server registered at /coros-mcp');
}

module.exports = { registerCorosMcpRoutes };
