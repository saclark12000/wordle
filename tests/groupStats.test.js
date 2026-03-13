const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_GROUP_STATS_LEADERBOARD_ID,
  deriveGroupStatsData,
  deriveGroupStatsCallouts,
  getGroupStatsLeaderboardEntries,
  buildGroupStatsPanelMarkup
} = require('../groupStats');

test('deriveGroupStatsData computes summary totals and per-player metrics', () => {
  const dataset = [
    { player: '@ace', guesses: 1, solved: true, isCrown: true, dayKey: 'd1', dayLabel: '2025-01-01', dayTimestamp: 1735689600000 },
    { player: '@buck', guesses: 3, solved: true, isCrown: false, dayKey: 'd1', dayLabel: '2025-01-01', dayTimestamp: 1735689600000 },
    { player: '@ace', guesses: 2, solved: true, isCrown: true, dayKey: 'd2', dayLabel: '2025-01-02', dayTimestamp: 1735776000000 },
    { player: '@buck', guesses: 2, solved: true, isCrown: true, dayKey: 'd2', dayLabel: '2025-01-02', dayTimestamp: 1735776000000 },
    { player: '@cara', guesses: null, solved: false, isCrown: false, dayKey: 'd2', dayLabel: '2025-01-02', dayTimestamp: 1735776000000 },
    { player: '@buck', guesses: 4, solved: true, isCrown: true, dayKey: 'd3', dayLabel: '2025-01-03', dayTimestamp: 1735862400000 }
  ];

  const stats = deriveGroupStatsData(dataset);
  const ace = stats.players.find((player) => player.name === '@ace');
  const buck = stats.players.find((player) => player.name === '@buck');
  const cara = stats.players.find((player) => player.name === '@cara');

  assert.equal(stats.totalDays, 3);
  assert.equal(stats.totalGames, 6);
  assert.equal(stats.totalCrowns, 4);
  assert.equal(stats.crownPct, '66.7');
  assert.equal(stats.latestDate, '2025-01-03');

  assert.deepEqual(ace, {
    name: '@ace',
    crownWins: 2,
    totalGames: 2,
    crownPct: 100,
    participation: 66.66666666666666,
    avgGuesses: 1.5,
    fails: 0,
    soloCrowns: 1,
    streak: 2
  });

  assert.equal(buck.crownWins, 2);
  assert.equal(buck.soloCrowns, 1);
  assert.equal(buck.streak, 2);
  assert.equal(cara.fails, 1);
  assert.equal(cara.avgGuesses, null);
});

test('deriveGroupStatsCallouts surfaces newcomer and concentration callouts', () => {
  const stats = {
    players: [
      { name: '@ace', crownWins: 5, totalGames: 5, crownPct: 100, participation: 100, avgGuesses: 1.8, fails: 0, soloCrowns: 2, streak: 5 },
      { name: '@buck', crownWins: 1, totalGames: 2, crownPct: 50, participation: 40, avgGuesses: 3, fails: 0, soloCrowns: 0, streak: 1 },
      { name: '@cara', crownWins: 1, totalGames: 3, crownPct: 33.3, participation: 60, avgGuesses: 4, fails: 1, soloCrowns: 0, streak: 1 }
    ],
    totalDays: 5,
    totalGames: 10,
    totalCrowns: 7,
    totalCrownRatio: 0.7,
    crownPct: '70.0',
    latestDate: '2025-01-05'
  };

  const callouts = deriveGroupStatsCallouts(stats);

  assert.equal(callouts.length, 3);
  assert.equal(callouts[0].title, 'Newcomer surge');
  assert.match(callouts[1].detail, /@ace owns 71% of crowns/);
  assert.match(callouts[2].detail, /70%/);
});

test('getGroupStatsLeaderboardEntries sorts ascending leaderboards and filters null values', () => {
  const stats = {
    players: [
      { name: '@ace', crownWins: 3, totalGames: 4, crownPct: 75, participation: 90, avgGuesses: 1.5, fails: 0, soloCrowns: 1, streak: 2 },
      { name: '@buck', crownWins: 1, totalGames: 4, crownPct: 25, participation: 90, avgGuesses: 3, fails: 2, soloCrowns: 0, streak: 1 },
      { name: '@cara', crownWins: 0, totalGames: 2, crownPct: 0, participation: 40, avgGuesses: null, fails: 1, soloCrowns: 0, streak: 0 }
    ],
    totalDays: 4,
    totalGames: 10,
    totalCrowns: 4,
    totalCrownRatio: 0.4,
    crownPct: '40.0',
    latestDate: '2025-01-04'
  };

  const leaderboard = getGroupStatsLeaderboardEntries(stats, 'avgGuesses');

  assert.equal(leaderboard.rows.length, 2);
  assert.equal(leaderboard.rows[0].player.name, '@ace');
  assert.equal(leaderboard.rows[0].formattedValue, '1.50');
  assert.equal(leaderboard.rows[1].player.name, '@buck');
  assert.equal(leaderboard.rows[0].barPct, 100);
});

test('buildGroupStatsPanelMarkup renders summary cards and active navigation state', () => {
  const stats = {
    players: [
      { name: '@ace', crownWins: 3, totalGames: 4, crownPct: 75, participation: 90, avgGuesses: 1.5, fails: 0, soloCrowns: 1, streak: 2 }
    ],
    totalDays: 4,
    totalGames: 4,
    totalCrowns: 3,
    totalCrownRatio: 0.75,
    crownPct: '75.0',
    latestDate: '2025-01-04'
  };

  const markup = buildGroupStatsPanelMarkup(stats, {
    activeLeaderboardId: 'fails',
    callouts: [{ title: 'Crown concentration', detail: '@ace owns the board.' }]
  });

  assert.ok(markup.includes('data-group-stats-panel="true"'));
  assert.ok(markup.includes('Last 4 day(s)'));
  assert.ok(markup.includes('Total Players'));
  assert.ok(markup.includes('data-group-stats-leaderboard="fails"'));
  assert.ok(markup.includes('groupStatsPanel__sidebarBtn--active'));
  assert.ok(markup.includes('💀 Fails'));
  assert.ok(markup.includes('Crown concentration'));
});

test('buildGroupStatsPanelMarkup falls back to the default leaderboard id', () => {
  const stats = {
    players: [
      { name: '@ace', crownWins: 1, totalGames: 1, crownPct: 100, participation: 100, avgGuesses: 1, fails: 0, soloCrowns: 1, streak: 1 }
    ],
    totalDays: 1,
    totalGames: 1,
    totalCrowns: 1,
    totalCrownRatio: 1,
    crownPct: '100.0',
    latestDate: '2025-01-01'
  };

  const markup = buildGroupStatsPanelMarkup(stats, {
    activeLeaderboardId: 'not-real'
  });

  assert.equal(DEFAULT_GROUP_STATS_LEADERBOARD_ID, 'crownWins');
  assert.ok(markup.includes('data-group-stats-leaderboard="crownWins"'));
});
