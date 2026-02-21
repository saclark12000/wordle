const test = require('node:test');
const assert = require('node:assert/strict');

const CrownWinsCore = require('../crownWinsCore');
global.CrownWinsCore = CrownWinsCore;
require('../stateManager');

const { createStateStore } = global.CrownState;

function buildNormalizedRows() {
  return [
    { dayKey: 'd1', dayIndex: 1, dayTimestamp: 1000, dayLabel: '2025-06-01', sourceRowIndex: 0, player: '@a' },
    { dayKey: 'd1', dayIndex: 1, dayTimestamp: 1000, dayLabel: '2025-06-01', sourceRowIndex: 0, player: '@b' },
    { dayKey: 'd2', dayIndex: 2, dayTimestamp: 2000, dayLabel: '2025-06-02', sourceRowIndex: 1, player: '@a' },
    { dayKey: 'd3', dayIndex: 3, dayTimestamp: 3000, dayLabel: '2025-06-03', sourceRowIndex: 2, player: '@c' }
  ];
}

test('state store clamps last-days filter and tracks total days', () => {
  const store = createStateStore();
  store.setNormalizedWordle(buildNormalizedRows());

  assert.equal(store.getTotalDays(), 3);
  assert.equal(store.setLastDays(NaN), 3);
  assert.equal(store.setLastDays(1), 1);
  assert.equal(store.setLastDays(999), 3);
  assert.equal(store.setLastDays(0), 3);
});

test('last-days subset returns selected day keys, latest label, and raw row indexes', () => {
  const store = createStateStore();
  store.setNormalizedWordle(buildNormalizedRows());
  store.setLastDays(2);

  const subset = store.getLastDaysSubset();
  assert.equal(subset.limit, 2);
  assert.equal(subset.maxDays, 3);
  assert.equal(subset.latestLabel, '2025-06-03');
  assert.equal(subset.rowCount, 2);
  assert.deepEqual([...subset.selectedDayKeys], ['d2', 'd3']);
  assert.deepEqual([...subset.selectedRowIndexes], [1, 2]);
});

test('player rows are scoped to the active last-days subset', () => {
  const store = createStateStore();
  store.setNormalizedWordle(buildNormalizedRows());

  store.setLastDays(1);
  assert.deepEqual(store.getPlayerRows('@a').map((row) => row.dayKey), []);
  assert.deepEqual(store.getPlayerRows('@c').map((row) => row.dayKey), ['d3']);

  store.setLastDays(3);
  assert.deepEqual(store.getPlayerRows('@a').map((row) => row.dayKey), ['d1', 'd2']);
});
