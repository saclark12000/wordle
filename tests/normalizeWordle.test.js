const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeWordle,
  detectDateField,
  looksLikeWordleSummary
} = require('../kingWinsCore');

test('normalizeWordle flattens Wordle CSV rows', () => {
  const columns = ['date posted', 'crown', 'crown round', '1/6', '2/6', '3/6', '4/6', '5/6', '6/6', 'X/6'];
  assert.ok(looksLikeWordleSummary(columns));
  const rows = [
    {
      'date posted': '2025-06-06',
      'crown': '@ace @buck',
      'crown round': '1/6',
      '1/6': '@ace',
      '2/6': '--',
      '3/6': '@buck @cara',
      '4/6': '@dax',
      '5/6': '--',
      '6/6': '--',
      'X/6': '@zero'
    }
  ];
  const field = detectDateField(columns);
  const normalized = normalizeWordle(rows, field);
  assert.equal(normalized.length, 5);
  const ace = normalized.find((r) => r.player === '@ace');
  assert.ok(ace);
  assert.equal(ace.guesses, 1);
  assert.equal(ace.dayLabel, '2025-06-06');
  assert.equal(ace.isCrown, true);
  const zero = normalized.find((r) => r.player === '@zero');
  assert.equal(zero.solved, false);
  assert.equal(zero.guesses, null);
});
