'use strict';
const { checkAppToken, getSheetsWriteAuth } = require('./auth');

describe('checkAppToken', () => {
  const saved = process.env.APP_TOKEN;
  afterEach(() => { process.env.APP_TOKEN = saved; if (saved === undefined) delete process.env.APP_TOKEN; });

  test('accepts the matching code', () => {
    process.env.APP_TOKEN = 'abc123';
    expect(checkAppToken('abc123')).toBe(true);
  });

  test.each([['wrong'], [''], [undefined], [null], [['abc123']]])('rejects %p', (provided) => {
    process.env.APP_TOKEN = 'abc123';
    expect(checkAppToken(provided)).toBe(false);
  });

  test('rejects everything when APP_TOKEN is not set', () => {
    delete process.env.APP_TOKEN;
    expect(checkAppToken('')).toBe(false);
    expect(checkAppToken('anything')).toBe(false);
  });
});

describe('getSheetsWriteAuth', () => {
  const saved = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  afterEach(() => { process.env.GOOGLE_SERVICE_ACCOUNT_JSON = saved; if (saved === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON; });

  test('reports a missing service account', () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    expect(getSheetsWriteAuth()).toEqual({ auth: null, error: expect.stringMatching(/not configured/) });
  });

  test('reports invalid JSON', () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = '{nope';
    expect(getSheetsWriteAuth().error).toMatch(/not valid JSON/);
  });

  test('builds read-write auth from a service account', () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ type: 'service_account', client_email: 'x@y.iam.gserviceaccount.com', private_key: 'k' });
    const { auth, error } = getSheetsWriteAuth();
    expect(error).toBeNull();
    expect(auth.scopes).toEqual(['https://www.googleapis.com/auth/spreadsheets']);
    expect(getSheetsWriteAuth().auth).toBe(auth); // reused
  });
});
