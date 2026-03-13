'use strict';

/**
 * summary.test.js
 * Unit tests for all pure functions in summary.js
 */

// Set env vars before requiring the module
process.env.SUMMARY_API_KEY = 'test-api-key-abc123';
process.env.SUMMARY_SPREADSHEET_ID = 'test-spreadsheet-id';

const {
  parseSheetsData,
  filterActive,
  applyParamFilters,
  groupBySession,
  computePRs,
  computeExerciseHistory,
  computeTrend,
  parseParams,
  verifyApiKey,
  isNumericUnit,
  parseDoubledWeight,
  getCacheKey,
} = require('./summary');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides = {}) {
  const defaults = {
    date: '2026-03-13T07:15:00.000Z',
    workout: 'A',
    exercise: 'Cable Fly',
    reps: 15,
    weight: 30,
    unit: 'lbs',
    weightKg: 13.6077,
    deload: '',
    deleted: ''
  };
  const d = { ...defaults, ...overrides };
  return [d.date, d.workout, d.exercise, String(d.reps), String(d.weight), d.unit, String(d.weightKg), d.deload, d.deleted];
}

function makeEntry(overrides = {}) {
  return parseSheetsData([makeRow(overrides)])[0];
}

// ─── parseSheetsData ──────────────────────────────────────────────────────────

describe('parseSheetsData', () => {
  test('parses a valid row correctly', () => {
    const rows = [makeRow()];
    const result = parseSheetsData(rows);
    expect(result).toHaveLength(1);
    expect(result[0].exercise).toBe('Cable Fly');
    expect(result[0].reps).toBe(15);
    expect(result[0].weight).toBe(30);
    expect(result[0].unit).toBe('lbs');
    expect(result[0].workout).toBe('A');
    expect(result[0].deload).toBe('');
    expect(result[0].deleted).toBe('');
  });

  test('skips rows with invalid dates', () => {
    const rows = [makeRow({ date: 'not-a-date' }), makeRow()];
    const result = parseSheetsData(rows);
    expect(result).toHaveLength(1);
  });

  test('handles missing weight gracefully', () => {
    const rows = [makeRow({ weight: '', weightKg: '' })];
    const result = parseSheetsData(rows);
    expect(result[0].weight).toBe(0);
    expect(result[0].weightKg).toBe(0);
  });

  test('handles missing reps gracefully', () => {
    const rows = [makeRow({ reps: '' })];
    const result = parseSheetsData(rows);
    expect(result[0].reps).toBe(0);
  });

  test('handles empty unit gracefully', () => {
    const rows = [makeRow({ unit: '' })];
    const result = parseSheetsData(rows);
    expect(result[0].unit).toBe('');
  });

  test('trims whitespace from exercise name', () => {
    const rows = [makeRow({ exercise: '  Cable Fly  ' })];
    const result = parseSheetsData(rows);
    expect(result[0].exercise).toBe('Cable Fly');
  });

  test('handles empty rows array', () => {
    expect(parseSheetsData([])).toEqual([]);
    expect(parseSheetsData(null)).toEqual([]);
  });

  test('rounds weightKg to 4 decimal places', () => {
    const rows = [makeRow({ weightKg: '13.607711864' })];
    const result = parseSheetsData(rows);
    expect(result[0].weightKg).toBe(13.6077);
  });

  test('parses multiple rows', () => {
    const rows = [
      makeRow({ exercise: 'Cable Fly', reps: 15 }),
      makeRow({ exercise: 'Goblet Squats', reps: 6 }),
    ];
    const result = parseSheetsData(rows);
    expect(result).toHaveLength(2);
    expect(result[0].exercise).toBe('Cable Fly');
    expect(result[1].exercise).toBe('Goblet Squats');
  });
});

// ─── filterActive ─────────────────────────────────────────────────────────────

describe('filterActive', () => {
  test('removes deleted entries', () => {
    const entries = [
      makeEntry({ deleted: 'Yes' }),
      makeEntry({ deleted: '' }),
      makeEntry({ deleted: 'Yes' }),
    ];
    const result = filterActive(entries);
    expect(result).toHaveLength(1);
  });

  test('keeps entries without deleted flag', () => {
    const entries = [makeEntry(), makeEntry()];
    expect(filterActive(entries)).toHaveLength(2);
  });

  test('handles empty array', () => {
    expect(filterActive([])).toEqual([]);
  });
});

// ─── groupBySession ───────────────────────────────────────────────────────────

describe('groupBySession', () => {
  test('groups same-day same-workout entries into one session', () => {
    const entries = [
      makeEntry({ date: '2026-03-13T07:00:00.000Z', workout: 'A' }),
      makeEntry({ date: '2026-03-13T07:30:00.000Z', workout: 'A' }),
      makeEntry({ date: '2026-03-13T08:00:00.000Z', workout: 'A' }),
    ];
    const sessions = groupBySession(entries);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sets).toHaveLength(3);
  });

  test('keeps same-day different-workout entries separate', () => {
    const entries = [
      makeEntry({ date: '2026-03-13T07:00:00.000Z', workout: 'A' }),
      makeEntry({ date: '2026-03-13T09:00:00.000Z', workout: 'B' }),
    ];
    const sessions = groupBySession(entries);
    expect(sessions).toHaveLength(2);
  });

  test('keeps different-day entries separate', () => {
    const entries = [
      makeEntry({ date: '2026-03-11T07:00:00.000Z', workout: 'A' }),
      makeEntry({ date: '2026-03-13T07:00:00.000Z', workout: 'A' }),
    ];
    const sessions = groupBySession(entries);
    expect(sessions).toHaveLength(2);
  });

  test('sorts sessions newest first', () => {
    const entries = [
      makeEntry({ date: '2026-03-11T07:00:00.000Z', workout: 'A' }),
      makeEntry({ date: '2026-03-13T07:00:00.000Z', workout: 'B' }),
    ];
    const sessions = groupBySession(entries);
    expect(sessions[0].workout).toBe('B');
    expect(sessions[1].workout).toBe('A');
  });

  test('flags session as deload if any entry is deload', () => {
    const entries = [
      makeEntry({ date: '2026-03-13T07:00:00.000Z', deload: '' }),
      makeEntry({ date: '2026-03-13T07:30:00.000Z', deload: 'Yes' }),
    ];
    const sessions = groupBySession(entries);
    expect(sessions[0].isDeload).toBe(true);
  });

  test('handles empty array', () => {
    expect(groupBySession([])).toEqual([]);
  });
});

// ─── computePRs ───────────────────────────────────────────────────────────────

describe('computePRs', () => {
  test('finds PR correctly for single exercise', () => {
    const entries = [
      makeEntry({ weight: 25, unit: 'lbs', reps: 10, date: '2026-01-01T00:00:00.000Z' }),
      makeEntry({ weight: 30, unit: 'lbs', reps: 12, date: '2026-02-01T00:00:00.000Z' }),
      makeEntry({ weight: 28, unit: 'lbs', reps: 15, date: '2026-03-01T00:00:00.000Z' }),
    ];
    const prs = computePRs(entries);
    const pr = prs.get('Cable Fly');
    expect(pr.weight).toBe(30);
    expect(pr.reps).toBe(12);
  });

  test('at same weight picks highest reps', () => {
    const entries = [
      makeEntry({ weight: 30, unit: 'lbs', reps: 10, date: '2026-01-01T00:00:00.000Z' }),
      makeEntry({ weight: 30, unit: 'lbs', reps: 15, date: '2026-03-13T00:00:00.000Z' }),
      makeEntry({ weight: 30, unit: 'lbs', reps: 13, date: '2026-02-01T00:00:00.000Z' }),
    ];
    const prs = computePRs(entries);
    const pr = prs.get('Cable Fly');
    expect(pr.reps).toBe(15);
  });

  test('ignores BW exercises', () => {
    const entries = [makeEntry({ weight: 0, unit: 'BW', reps: 10 })];
    const prs = computePRs(entries);
    expect(prs.get('Cable Fly')).toBeUndefined();
  });

  test('ignores band exercises', () => {
    const entries = [makeEntry({ exercise: 'Band Pullaparts (Palms Down)', weight: 0, unit: 'Blue Band', reps: 10 })];
    const prs = computePRs(entries);
    expect(prs.get('Band Pullaparts (Palms Down)')).toBeUndefined();
  });

  test('ignores NA exercises', () => {
    const entries = [makeEntry({ weight: 0, unit: 'NA', reps: 45 })];
    const prs = computePRs(entries);
    expect(prs.get('Cable Fly')).toBeUndefined();
  });

  test('handles floating point weight comparison correctly', () => {
    // 30 lbs in kg = 13.6077... — should not miss this due to floating point
    const entries = [
      makeEntry({ weight: 30, unit: 'lbs', weightKg: 13.607771864, reps: 13 }),
      makeEntry({ weight: 30, unit: 'lbs', weightKg: 13.607771864, reps: 15 }),
    ];
    const prs = computePRs(entries);
    expect(prs.get('Cable Fly').reps).toBe(15);
  });

  test('computes PRs for multiple exercises separately', () => {
    const entries = [
      makeEntry({ exercise: 'Cable Fly', weight: 30, unit: 'lbs', reps: 15 }),
      makeEntry({ exercise: 'Goblet Squats', weight: 35, unit: 'lbs', reps: 6 }),
    ];
    const prs = computePRs(entries);
    expect(prs.size).toBe(2);
    expect(prs.get('Cable Fly').weight).toBe(30);
    expect(prs.get('Goblet Squats').weight).toBe(35);
  });

  test('handles empty array', () => {
    expect(computePRs([])).toEqual(new Map());
  });

  test('does not count zero weight entries', () => {
    const entries = [makeEntry({ weight: 0, unit: 'lbs', reps: 10 })];
    const prs = computePRs(entries);
    expect(prs.get('Cable Fly')).toBeUndefined();
  });
});

// ─── computeTrend ─────────────────────────────────────────────────────────────

describe('computeTrend', () => {
  function makeSessions(repsList) {
    return repsList.map((reps, i) => ({
      date: new Date(`2026-0${Math.min(i + 1, 9)}-01`),
      workout: 'A',
      isDeload: false,
      sets: [{ reps, weight: 30, unit: 'lbs' }]
    }));
  }

  test('returns improving when recent reps are significantly higher', () => {
    const sessions = makeSessions([15, 15, 14, 10, 10, 10]);
    expect(computeTrend(sessions)).toMatch(/improving/);
  });

  test('returns declining when recent reps are significantly lower', () => {
    const sessions = makeSessions([8, 8, 8, 15, 15, 15]);
    expect(computeTrend(sessions)).toMatch(/declining/);
  });

  test('returns stable when change is within 5%', () => {
    const sessions = makeSessions([10, 10, 10, 10, 10, 10]);
    expect(computeTrend(sessions)).toMatch(/stable/);
  });

  test('returns insufficient data with fewer than 4 sessions', () => {
    const sessions = makeSessions([10, 10, 10]);
    expect(computeTrend(sessions)).toBe('insufficient data');
  });
});

// ─── isNumericUnit ────────────────────────────────────────────────────────────

describe('isNumericUnit', () => {
  test('lbs is numeric', () => expect(isNumericUnit('lbs')).toBe(true));
  test('kg is numeric', () => expect(isNumericUnit('kg')).toBe(true));
  test('BW is not numeric', () => expect(isNumericUnit('BW')).toBe(false));
  test('NA is not numeric', () => expect(isNumericUnit('NA')).toBe(false));
  test('bodyweight is not numeric', () => expect(isNumericUnit('bodyweight')).toBe(false));
  test('Red Band is not numeric', () => expect(isNumericUnit('Red Band')).toBe(false));
  test('Blue Band is not numeric', () => expect(isNumericUnit('Blue Band')).toBe(false));
  test('seconds is not numeric', () => expect(isNumericUnit('seconds')).toBe(false));
  test('empty string is not numeric', () => expect(isNumericUnit('')).toBe(false));
  test('null is not numeric', () => expect(isNumericUnit(null)).toBe(false));
});

// ─── parseDoubledWeight ───────────────────────────────────────────────────────

describe('parseDoubledWeight', () => {
  test('parses 2×25 lbs format', () => {
    const result = parseDoubledWeight(0, '2×25 lbs');
    expect(result).not.toBeNull();
    expect(result.weight).toBe(25);
    expect(result.unit).toBe('lbs');
  });

  test('parses 2x25 lbs format (ASCII x)', () => {
    const result = parseDoubledWeight(0, '2x25 lbs');
    expect(result).not.toBeNull();
    expect(result.weight).toBe(25);
  });

  test('returns null for regular unit', () => {
    expect(parseDoubledWeight(30, 'lbs')).toBeNull();
  });

  test('returns null for band unit', () => {
    expect(parseDoubledWeight(0, 'Blue Band')).toBeNull();
  });
});

// ─── parseParams ─────────────────────────────────────────────────────────────

describe('parseParams', () => {
  test('defaults to full mode', () => {
    const { params, error } = parseParams({});
    expect(error).toBeNull();
    expect(params.mode).toBe('full');
  });

  test('accepts valid modes', () => {
    for (const mode of ['full', 'recent', 'prs', 'exercise']) {
      const name = mode === 'exercise' ? 'Cable Fly' : undefined;
      const { error } = parseParams({ mode, ...(name ? { name } : {}) });
      expect(error).toBeNull();
    }
  });

  test('rejects invalid mode', () => {
    const { error } = parseParams({ mode: 'invalid' });
    expect(error).not.toBeNull();
  });

  test('requires name for exercise mode', () => {
    const { error } = parseParams({ mode: 'exercise' });
    expect(error).not.toBeNull();
    expect(error).toMatch(/name/);
  });

  test('parses valid months', () => {
    const { params } = parseParams({ months: '3' });
    expect(params.months).toBe(3);
    expect(params.cutoffDate).not.toBeNull();
  });

  test('rejects invalid months', () => {
    expect(parseParams({ months: 'abc' }).error).not.toBeNull();
    expect(parseParams({ months: '0' }).error).not.toBeNull();
    expect(parseParams({ months: '200' }).error).not.toBeNull();
  });

  test('parses valid sessions', () => {
    const { params } = parseParams({ sessions: '20' });
    expect(params.sessions).toBe(20);
  });

  test('rejects invalid sessions', () => {
    expect(parseParams({ sessions: '0' }).error).not.toBeNull();
    expect(parseParams({ sessions: '100' }).error).not.toBeNull();
  });

  test('parses valid since date', () => {
    const { params, error } = parseParams({ since: '2026-01-01' });
    expect(error).toBeNull();
    expect(params.since).not.toBeNull();
    expect(params.cutoffDate).not.toBeNull();
  });

  test('rejects invalid since date', () => {
    const { error } = parseParams({ since: 'not-a-date' });
    expect(error).not.toBeNull();
  });

  test('since wins over months when both provided', () => {
    const { params } = parseParams({ since: '2026-01-01', months: '3' });
    expect(params.cutoffDate.toISOString()).toContain('2026-01-01');
  });

  test('accepts valid deload values', () => {
    expect(parseParams({ deload: 'exclude' }).error).toBeNull();
    expect(parseParams({ deload: 'only' }).error).toBeNull();
  });

  test('rejects invalid deload value', () => {
    expect(parseParams({ deload: 'yes' }).error).not.toBeNull();
  });
});

// ─── verifyApiKey ─────────────────────────────────────────────────────────────

describe('verifyApiKey', () => {
  test('accepts correct key', () => {
    expect(verifyApiKey('test-api-key-abc123')).toBe(true);
  });

  test('rejects wrong key', () => {
    expect(verifyApiKey('wrong-key')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(verifyApiKey('')).toBe(false);
  });

  test('rejects null', () => {
    expect(verifyApiKey(null)).toBe(false);
  });

  test('rejects undefined', () => {
    expect(verifyApiKey(undefined)).toBe(false);
  });
});

// ─── getCacheKey ──────────────────────────────────────────────────────────────

describe('getCacheKey', () => {
  test('different modes produce different keys', () => {
    const a = getCacheKey({ mode: 'full', months: null, since: null, deload: null, name: null, sessions: 10 });
    const b = getCacheKey({ mode: 'recent', months: null, since: null, deload: null, name: null, sessions: 10 });
    expect(a).not.toBe(b);
  });

  test('different months produce different keys', () => {
    const a = getCacheKey({ mode: 'full', months: 3, since: null, deload: null, name: null, sessions: 10 });
    const b = getCacheKey({ mode: 'full', months: 6, since: null, deload: null, name: null, sessions: 10 });
    expect(a).not.toBe(b);
  });

  test('same params produce same key', () => {
    const params = { mode: 'full', months: 3, since: null, deload: 'exclude', name: null, sessions: 10 };
    expect(getCacheKey(params)).toBe(getCacheKey(params));
  });
});

// ─── applyParamFilters ────────────────────────────────────────────────────────

describe('applyParamFilters', () => {
  test('filters out deleted entries', () => {
    const entries = [
      makeEntry({ deleted: 'Yes' }),
      makeEntry({ deleted: '' }),
    ];
    const result = applyParamFilters(entries, { cutoffDate: null, deload: null, name: null });
    expect(result).toHaveLength(1);
  });

  test('applies cutoff date', () => {
    const entries = [
      makeEntry({ date: '2026-01-01T00:00:00.000Z' }),
      makeEntry({ date: '2026-03-13T00:00:00.000Z' }),
    ];
    const result = applyParamFilters(entries, {
      cutoffDate: new Date('2026-02-01'),
      deload: null,
      name: null
    });
    expect(result).toHaveLength(1);
  });

  test('deload=exclude removes deload entries', () => {
    const entries = [
      makeEntry({ deload: 'Yes' }),
      makeEntry({ deload: '' }),
    ];
    const result = applyParamFilters(entries, { cutoffDate: null, deload: 'exclude', name: null });
    expect(result).toHaveLength(1);
    expect(result[0].deload).toBe('');
  });

  test('deload=only keeps only deload entries', () => {
    const entries = [
      makeEntry({ deload: 'Yes' }),
      makeEntry({ deload: '' }),
    ];
    const result = applyParamFilters(entries, { cutoffDate: null, deload: 'only', name: null });
    expect(result).toHaveLength(1);
    expect(result[0].deload).toBe('Yes');
  });

  test('name filter is case-insensitive', () => {
    const entries = [
      makeEntry({ exercise: 'Cable Fly' }),
      makeEntry({ exercise: 'Goblet Squats' }),
    ];
    const result = applyParamFilters(entries, { cutoffDate: null, deload: null, name: 'cable fly' });
    expect(result).toHaveLength(1);
    expect(result[0].exercise).toBe('Cable Fly');
  });
});
