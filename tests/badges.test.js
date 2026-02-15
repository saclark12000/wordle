const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createKingContext,
  buildPlayerMetricsMap,
  resolvePlayerBadge
} = require('../badges');

test('resolvePlayerBadge prioritizes first place badge', () => {
  const dataset = [
    { player: '@ace', guesses: 1, solved: true, isCrown: true },
    { player: '@ace', guesses: 1, solved: true, isCrown: false },
    { player: '@buck', guesses: 2, solved: true, isCrown: true }
  ];
  const leaderboard = [
    { player: '@ace', place: 1, winCount: 1, totalGames: 2, ratio: 0.5 },
    { player: '@buck', place: 2, winCount: 1, totalGames: 1, ratio: 1 }
  ];
  const ctx = createKingContext();
  ctx.dataset = dataset;
  ctx.leaderboard = leaderboard;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const badge = resolvePlayerBadge(ctx, '@ace');
  assert.ok(badge);
  assert.equal(badge.id, 'king_leaderboard_first_place');
});

test('resolvePlayerBadge returns sus-wins badge when applicable', () => {
  const dataset = [
    { player: '@sus', guesses: 1, solved: true, isCrown: false },
    { player: '@sus', guesses: 1, solved: true, isCrown: false },
    { player: '@sus', guesses: 2, solved: true, isCrown: false }
  ];
  const ctx = createKingContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);
  ctx.leaderboard = [];

  const badge = resolvePlayerBadge(ctx, '@sus');
  assert.ok(badge);
  assert.equal(badge.id, 'has_sus_wins');
});
