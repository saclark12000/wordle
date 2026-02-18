const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCrownContext,
  buildPlayerMetricsMap,
  resolvePlayerBadges,
  resolvePlayerBadge,
  buildPlayerBadgesMarkup
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
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.leaderboard = leaderboard;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const badge = resolvePlayerBadge(ctx, '@ace');
  assert.ok(badge);
  assert.equal(badge.id, 'crown_leaderboard_first_place');
});

test('resolvePlayerBadge returns sus-wins badge when applicable', () => {
  const dataset = [
    { player: '@sus', guesses: 1, solved: true, isCrown: false },
    { player: '@sus', guesses: 1, solved: true, isCrown: false },
    { player: '@sus', guesses: 2, solved: true, isCrown: false }
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);
  ctx.leaderboard = [];

  const badge = resolvePlayerBadge(ctx, '@sus');
  assert.ok(badge);
  assert.equal(badge.id, 'has_sus_wins');
});

test('leaderboard rankings expose crown guess leaders', () => {
  const dataset = [
    { player: '@ace', guesses: 1, solved: true, isCrown: true },
    { player: '@ace', guesses: 1, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@buck', guesses: 2, solved: true, isCrown: true },
    { player: '@buck', guesses: 2, solved: true, isCrown: true }
  ];
  const leaderboard = [
    { player: '@ace', place: 1, winCount: 4, totalGames: 4, ratio: 1 },
    { player: '@buck', place: 2, winCount: 2, totalGames: 2, ratio: 1 }
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.leaderboard = leaderboard;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const badge = resolvePlayerBadge(ctx, '@ace');
  assert.ok(badge);

  const rankings = ctx.leaderboard.rankings;
  assert.ok(rankings, 'expected rankings object on ctx.leaderboard');
  assert.deepEqual(rankings.crownGuessLeaders['1/6'], { leaders: ['@ace'], winCount: 2 });
  assert.equal(rankings.crownGuessLeaders['2/6'].winCount, 2);
  assert.deepEqual(rankings.crownGuessLeaders['2/6'].leaders, ['@ace', '@buck']);
  assert.ok(rankings.playerGuessLeaders['@ace']['1/6']);
  assert.ok(!rankings.playerGuessLeaders['@buck']?.['1/6']);
});

test('resolvePlayerBadges returns up to four badges in manifest order', () => {
  const dataset = [
    { player: '@ace', guesses: 1, solved: true, isCrown: true },
    { player: '@ace', guesses: 1, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true }
  ];
  const leaderboard = [
    { player: '@ace', place: 1, winCount: 8, totalGames: 8, ratio: 1 }
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.leaderboard = leaderboard;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const badges = resolvePlayerBadges(ctx, '@ace');

  assert.equal(badges.length, 4);
  assert.deepEqual(
    badges.map((badge) => badge.id),
    [
      'crown_leaderboard_first_place',
      'has_sus_wins',
      'crown_guardian',
      'win_under_20'
    ]
  );
});

test('resolvePlayerBadges honors maxBadges option', () => {
  const dataset = [
    { player: '@ace', guesses: 1, solved: true, isCrown: true },
    { player: '@ace', guesses: 1, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true }
  ];
  const leaderboard = [
    { player: '@ace', place: 1, winCount: 8, totalGames: 8, ratio: 1 }
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.leaderboard = leaderboard;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const badges = resolvePlayerBadges(ctx, '@ace', { maxBadges: 2 });

  assert.equal(badges.length, 2);
  assert.deepEqual(
    badges.map((badge) => badge.id),
    ['crown_leaderboard_first_place', 'has_sus_wins']
  );
});

test('buildPlayerBadgesMarkup limits output to four badge chips', () => {
  const markup = buildPlayerBadgesMarkup([
    { id: 'one', icon: '1', text: 'One', description: 'First' },
    { id: 'two', icon: '2', text: 'Two', description: 'Second' },
    { id: 'three', icon: '3', text: 'Three', description: 'Third' },
    { id: 'four', icon: '4', text: 'Four', description: 'Fourth' },
    { id: 'five', icon: '5', text: 'Five', description: 'Fifth' }
  ]);

  const interactiveBadgeCount = (markup.match(/data-player-badge=\"true\"/g) || []).length;
  assert.equal(interactiveBadgeCount, 4);
  assert.ok(!markup.includes('data-badge-id="five"'));
  assert.ok(markup.includes('class="playerCard__badgeDetails"'));
  assert.ok(markup.includes('class="playerCard__badgeTitle">One</div>'));
  assert.ok(markup.includes('class="playerCard__badgeDescription">First</div>'));
});


