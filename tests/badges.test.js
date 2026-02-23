const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PLAYER_CARD_BADGE_MANIFEST,
  createCrownContext,
  buildPlayerMetricsMap,
  buildLeaderboardRankings,
  resolvePlayerCardBadges,
  buildPlayerBadgesMarkup
} = require('../badges');

test('leaderboard rankings expose crown guess leaders', () => {
  const dataset = [
    { player: '@ace', guesses: 1, solved: true, isCrown: true },
    { player: '@ace', guesses: 1, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@buck', guesses: 2, solved: true, isCrown: true },
    { player: '@buck', guesses: 2, solved: true, isCrown: true }
  ];
  const rankings = buildLeaderboardRankings(buildPlayerMetricsMap(dataset));

  assert.deepEqual(rankings.crownGuessLeaders['1/6'], { leaders: ['@ace'], winCount: 2 });
  assert.equal(rankings.crownGuessLeaders['2/6'].winCount, 2);
  assert.deepEqual(rankings.crownGuessLeaders['2/6'].leaders, ['@ace', '@buck']);
  assert.ok(rankings.playerGuessLeaders['@ace']['1/6']);
  assert.ok(!rankings.playerGuessLeaders['@buck']?.['1/6']);
});

test('resolvePlayerCardBadges returns all player-card badges by default', () => {
  const dataset = [
    { player: '@ace', guesses: 1, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 3, solved: true, isCrown: true },
    { player: '@ace', guesses: 3, solved: true, isCrown: false },
    { player: '@ace', guesses: 4, solved: true, isCrown: false },
    { player: '@ace', guesses: 5, solved: true, isCrown: false },
    { player: '@ace', guesses: 6, solved: true, isCrown: false },
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 2, solved: true, isCrown: false },
    { player: '@buck', guesses: 2, solved: true, isCrown: true },
    { player: '@cara', guesses: 2, solved: true, isCrown: true }
  ];

  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);
  ctx.windowDays = 10;

  const badges = resolvePlayerCardBadges(ctx, '@ace', {
    insights: {
      activeCrownStreak: 3,
      bestCrownStreak: 5,
      avgGuessWhenCrowned: 2.4,
      participationRate: 0.9
    }
  });

  assert.equal(badges.length, PLAYER_CARD_BADGE_MANIFEST.length);
  assert.ok(badges.every((badge) => typeof badge.progress === 'string' && badge.progress.length > 0));
  assert.ok(badges.every((badge) => typeof badge.requirement === 'string' && badge.requirement.length > 0));
  const badgeCollector = badges.find((badge) => badge.id === 'badge_collector');
  assert.ok(badgeCollector);
  assert.equal(badgeCollector.earned, true);
  assert.equal(badgeCollector.progress, '8 / 5 badges earned');
});

test('resolvePlayerCardBadges honors maxBadges option', () => {
  const dataset = [
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@buck', guesses: 2, solved: true, isCrown: true }
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const badges = resolvePlayerCardBadges(ctx, '@ace', {
    maxBadges: 3,
    insights: {
      activeCrownStreak: 0,
      bestCrownStreak: 0,
      avgGuessWhenCrowned: null,
      participationRate: 0.1
    }
  });

  assert.equal(badges.length, 3);
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

  const badges = resolvePlayerCardBadges(ctx, '@late', {
    windowDays: 20,
    insights: {
      activeCrownStreak: 0,
      bestCrownStreak: 0,
      avgGuessWhenCrowned: null,
      participationRate: 0.05
    }
  });

  assert.equal(badges.length, PLAYER_CARD_BADGE_MANIFEST.length);
  assert.ok(badges.every((badge) => typeof badge.progress === 'string' && badge.progress.length > 0));
  assert.ok(badges.every((badge) => typeof badge.requirement === 'string' && badge.requirement.length > 0));
  assert.ok(badges.every((badge) => badge.earned === false));
  assert.equal(badges.find((badge) => badge.id === 'top_ten_rank').progress, 'Current rank: 12th (0 crowns)');
  assert.equal(badges.find((badge) => badge.id === 'games_played').progress, '1 / 12 games');
  assert.equal(badges.find((badge) => badge.id === 'badge_collector').progress, '0 / 5 badges earned');
});

test('buildPlayerBadgesMarkup supports rendering more than eight badge chips', () => {
  const markup = buildPlayerBadgesMarkup([
    { id: 'one', icon: '1', text: 'One', description: 'First', progress: '1/1', requirement: 'Done' },
    { id: 'two', icon: '2', text: 'Two', description: 'Second', progress: '1/1', requirement: 'Done' },
    { id: 'three', icon: '3', text: 'Three', description: 'Third', progress: '1/1', requirement: 'Done' },
    { id: 'four', icon: '4', text: 'Four', description: 'Fourth', progress: '1/1', requirement: 'Done' },
    { id: 'five', icon: '5', text: 'Five', description: 'Fifth', progress: '1/1', requirement: 'Done' },
    { id: 'six', icon: '6', text: 'Six', description: 'Sixth', progress: '1/1', requirement: 'Done' },
    { id: 'seven', icon: '7', text: 'Seven', description: 'Seventh', progress: '1/1', requirement: 'Done' },
    { id: 'eight', icon: '8', text: 'Eight', description: 'Eighth', progress: '1/1', requirement: 'Done' },
    { id: 'nine', icon: '9', text: 'Nine', description: 'Ninth', progress: '1/1', requirement: 'Done' }
  ], { maxBadges: 9 });

  const interactiveBadgeCount = (markup.match(/data-player-badge="true"/g) || []).length;
  assert.equal(interactiveBadgeCount, 9);
  assert.ok(markup.includes('data-badge-id="nine"'));
  assert.ok(markup.includes('class="playerCard__badgeDetails"'));
  assert.ok(markup.includes('class="playerCard__badgeTitle">One</div>'));
  assert.ok(markup.includes('class="playerCard__badgeDescription">First</div>'));
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

test('buildPlayerBadgesMarkup groups active badges above inactive badges', () => {
  const markup = buildPlayerBadgesMarkup(
    [
      { id: 'locked_a', text: 'Locked A', progress: '0/2', requirement: 'Get 2', earned: false },
      { id: 'earned_a', icon: 'A', text: 'Earned A', progress: '2/2', requirement: 'Done', earned: true },
      { id: 'locked_b', text: 'Locked B', progress: '1/3', requirement: 'Get 3', earned: false },
      { id: 'earned_b', icon: 'B', text: 'Earned B', progress: '3/3', requirement: 'Done', earned: true }
    ],
    { maxBadges: 4 }
  );

  const activeHeaderIndex = markup.indexOf('playerCard__badgeGroupTitle">🟩 Active badges</div>');
  const inactiveHeaderIndex = markup.indexOf('playerCard__badgeGroupTitle">⬛ Inactive badges</div>');
  const earnedFirstIndex = markup.indexOf('data-badge-id="earned_a"');
  const lockedFirstIndex = markup.indexOf('data-badge-id="locked_a"');

  assert.ok(activeHeaderIndex >= 0);
  assert.ok(inactiveHeaderIndex > activeHeaderIndex);
  assert.ok(earnedFirstIndex >= 0);
  assert.ok(lockedFirstIndex > earnedFirstIndex);
});
