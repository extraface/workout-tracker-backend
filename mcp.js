'use strict';

/**
 * mcp.js
 * Remote MCP server for Dave's workout tracker.
 *
 * Exposes workout data as proper MCP tools so Claude can call them
 * on demand in any project, any conversation, without URL fetching.
 *
 * Transport: Streamable HTTP (POST /mcp) — the current MCP standard.
 * Connect in Claude.ai: Settings > Connectors > Add custom connector
 * URL: https://workout-tracker-backend-production-c138.up.railway.app/mcp
 */

const express = require('express');
const { buildSummary, parseParams } = require('./summary');

const router = express.Router();

// ─── MCP Protocol Helpers ─────────────────────────────────────────────────────

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_recent_workouts',
    description: 'Get Dave\'s most recent workout sessions including all sets, reps, and weights. Use this whenever Dave asks about recent training, how a workout went, or wants a session review.',
    inputSchema: {
      type: 'object',
      properties: {
        sessions: {
          type: 'number',
          description: 'Number of recent sessions to return (default: 3)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_personal_records',
    description: 'Get all of Dave\'s personal records (PRs) for every exercise. Use when Dave asks about his bests, peaks, or progress on specific lifts.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_exercise_history',
    description: 'Get full history and stats for a specific exercise. Use when Dave asks about progress on a particular movement.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Exercise name, e.g. "Goblet Squats", "Cable Fly", "Kettlebell RDLs"',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_full_summary',
    description: 'Get Dave\'s complete workout summary — all sessions, PRs, and exercise history. Use for comprehensive training reviews or when unsure what data is needed.',
    inputSchema: {
      type: 'object',
      properties: {
        months: {
          type: 'number',
          description: 'Limit to last N months of data (default: all time)',
        },
      },
      required: [],
    },
  },
];

// ─── Tool Execution ───────────────────────────────────────────────────────────

async function executeTool(name, args) {
  let queryParams = {};

  switch (name) {
    case 'get_recent_workouts':
      queryParams = {
        mode: 'recent',
        sessions: args.sessions || 3,
      };
      break;

    case 'get_personal_records':
      queryParams = { mode: 'prs' };
      break;

    case 'get_exercise_history':
      if (!args.name) throw new Error('Exercise name is required');
      queryParams = { mode: 'exercise', name: args.name };
      break;

    case 'get_full_summary':
      queryParams = {
        mode: 'full',
        ...(args.months ? { months: args.months } : {}),
      };
      break;

    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  const { params, error } = parseParams(queryParams);
  if (error) throw new Error(error);

  const text = await buildSummary(params);
  return text;
}

// ─── MCP Request Handler ──────────────────────────────────────────────────────

router.post('/', express.json(), async (req, res) => {
  const { jsonrpc, id, method, params } = req.body;

  if (jsonrpc !== '2.0') {
    return res.json(jsonRpcError(id, -32600, 'Invalid JSON-RPC version'));
  }

  try {
    // Initialize — Claude discovers server capabilities
    if (method === 'initialize') {
      return res.json(jsonRpcResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'dave-workout-tracker', version: '1.0.0' },
      }));
    }

    // List available tools
    if (method === 'tools/list') {
      return res.json(jsonRpcResult(id, { tools: TOOLS }));
    }

    // Execute a tool call
    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      if (!toolName) {
        return res.json(jsonRpcError(id, -32602, 'Missing tool name'));
      }

      console.log(`[MCP] tools/call: ${toolName}`, JSON.stringify(toolArgs));

      const result = await executeTool(toolName, toolArgs);

      return res.json(jsonRpcResult(id, {
        content: [{ type: 'text', text: result }],
      }));
    }

    // Notifications (no response needed)
    if (method === 'notifications/initialized') {
      return res.status(204).send();
    }

    // Unknown method
    return res.json(jsonRpcError(id, -32601, `Method not found: ${method}`));

  } catch (err) {
    console.error(`[MCP] Error in ${method}:`, err.message);
    return res.json(jsonRpcError(id, -32603, err.message));
  }
});

// ─── Register on Express App ──────────────────────────────────────────────────

function registerMcpRoutes(app) {
  app.use('/mcp', router);
  console.log('[MCP] Server registered at /mcp');
}

module.exports = { registerMcpRoutes };
