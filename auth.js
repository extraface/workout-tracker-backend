'use strict';
/**
 * App authentication for the workout tracker frontend.
 *
 * Each device stores an access code that must match the APP_TOKEN env var.
 * Sheets reads and writes use the backend's Google service account
 * (GOOGLE_SERVICE_ACCOUNT_JSON), so nothing depends on a Google sign-in or
 * an in-memory session that a restart would wipe.
 */
const crypto = require('crypto');
const { google } = require('googleapis');

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

/** True when `provided` matches APP_TOKEN (ignoring surrounding whitespace). Timing-safe; false if unset. */
function checkAppToken(provided) {
  // Trim both sides: a pasted value can pick up stray spaces or newlines
  const expected = (process.env.APP_TOKEN || '').trim();
  if (!expected || typeof provided !== 'string' || provided.trim().length === 0) {
    return false;
  }
  const a = crypto.createHash('sha256').update(provided.trim()).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

let cached = { raw: null, auth: null };

/**
 * Read-write Sheets auth from the service account. Returns { auth, error }.
 * The client is reused until the env var changes.
 */
function getSheetsWriteAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    return { auth: null, error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' };
  }
  if (cached.raw === raw && cached.auth) {
    return { auth: cached.auth, error: null };
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
  const auth = new google.auth.GoogleAuth({ credentials: parsed, scopes: [SHEETS_SCOPE] });
  cached = { raw, auth };
  return { auth, error: null };
}

module.exports = { checkAppToken, getSheetsWriteAuth };
