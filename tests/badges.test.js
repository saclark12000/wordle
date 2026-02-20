const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCrownContext,
  buildPlayerMetricsMap,
  resolvePlayerBadges,
  resolvePlayerCardBadges,
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

test('resolvePlayerCardBadges returns locked badges with progress and requirement text', () => {
  const dataset = [
    { player: '@p1', guesses: 2, solved: true, isCrown: true },
    { player: '@p2', guesses: 2, solved: true, isCrown: true },
    { player: '@p3', guesses: 2, solved: true, isCrown: true },
    { player: '@p4', guesses: 2, solved: true, isCrown: true },
    { player: '@p5', guesses: 2, solved: true, isCrown: true },
    { player: '@p6', guesses: 2, solved: true, isCrown: true },
    { player: '@p7', guesses: 2, solved: true, isCrown: true },
    { player: '@p8', guesses: 2, solved: true, isCrown: true },
    { player: '@p9', guesses: 2, solved: true, isCrown: true },
    { player: '@p10', guesses: 2, solved: true, isCrown: true },
    { player: '@p11', guesses: 2, solved: true, isCrown: true },
    { player: '@late', guesses: 3, solved: true, isCrown: false }
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);
  ctx.leaderboard = [];

  const badges = resolvePlayerCardBadges(ctx, '@late', {
    windowDays: 20,
    insights: {
      activeCrownStreak: 0,
      bestCrownStreak: 0,
      avgGuessWhenCrowned: null,
      participationRate: 0.05
    }
  });

  assert.equal(badges.length, 8);
  assert.ok(badges.every((badge) => typeof badge.progress === 'string' && badge.progress.length > 0));
  assert.ok(badges.every((badge) => typeof badge.requirement === 'string' && badge.requirement.length > 0));
  assert.ok(badges.every((badge) => badge.earned === false));
  assert.equal(badges.find((badge) => badge.id === 'top_ten_rank').progress, 'Current rank: 12th (0 crowns)');
  assert.equal(badges.find((badge) => badge.id === 'games_played').progress, '1 / 12 games');
});

test('buildPlayerBadgesMarkup renders locked badge state and details rows', () => {
  const markup = buildPlayerBadgesMarkup(
    [
      {
        id: 'locked_badge',
        text: 'Locked Badge',
        description: 'Needs work',
        progress: '1 / 5',
        requirement: 'Reach 5',
        earned: false
      }
    ],
    { maxBadges: 1 }
  );

  assert.ok(markup.includes('playerCard__badge--locked'));
  assert.ok(markup.includes('data-badge-earned="false"'));
  assert.ok(markup.includes('playerCard__badgeDetailRow'));
  assert.ok(markup.includes('Current'));
  assert.ok(markup.includes('Requirement'));
});


