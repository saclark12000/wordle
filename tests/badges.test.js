const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PLAYER_CARD_BADGE_MANIFEST,
  createCrownContext,
  createBadgeMetricRegistry,
  buildPlayerMetricsMap,
  buildLeaderboardRankings,
  buildBadgeContext,
  summarizeBadgeContextForDebug,
  resolvePlayerCardBadges,
  buildPlayerBadgesMarkup,
  buildRoundBreakdownBadgeMap
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

test('createBadgeMetricRegistry resolves precedence and namespaced lookup', () => {
  const registry = createBadgeMetricRegistry({
    core: { participationRate: 0.2, nested: { value: 1 } },
    derived: { participationRate: 0.4, gamesPlayedTarget: 10 },
    insights: { participationRate: 0.6, activeCrownStreak: 2 },
    custom: { participationRate: 0.9 }
  });

  assert.equal(registry.get('participationRate'), 0.9);
  assert.equal(registry.get('insights.activeCrownStreak'), 2);
  assert.equal(registry.get('core.nested.value'), 1);
  assert.equal(registry.getNumber('missingMetric', 7), 7);
  assert.equal(registry.has('derived.gamesPlayedTarget'), true);
  assert.equal(registry.values.participationRate, 0.9);
});

test('buildBadgeContext exposes metric helpers and merged metric sources', () => {
  const dataset = [
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 4, solved: true, isCrown: false }
  ];
  const context = createCrownContext();
  context.dataset = dataset;
  context.playerMetrics = buildPlayerMetricsMap(dataset);
  context.badgeMetricSources = {
    custom: {
      bonusMetric: 42
    }
  };

  const badgeCtx = buildBadgeContext(context, '@ace', {
    windowDays: 20,
    metricSources: {
      insights: {
        participationRate: 0.4
      },
      custom: {
        participationRate: 0.85
      }
    }
  });

  assert.equal(badgeCtx.metricNumber('gamesPlayedTarget'), 12);
  assert.equal(badgeCtx.metricNumber('crownRatio').toFixed(1), '0.5');
  assert.equal(badgeCtx.metric('participationRate'), 0.85);
  assert.equal(badgeCtx.metric('insights.participationRate'), 0.4);
  assert.equal(badgeCtx.metric('bonusMetric'), 42);
  assert.equal(badgeCtx.metricNumber('playerRank'), 1);
  assert.equal(badgeCtx.metric('totalGames'), 2);
  assert.equal('metrics' in badgeCtx, false);
  assert.equal('insights' in badgeCtx, false);
  assert.equal('rows' in badgeCtx, false);
  assert.equal('leaderboard' in badgeCtx, false);
});

test('summarizeBadgeContextForDebug returns readable snapshot sections', () => {
  const dataset = [
    { player: '@ace', guesses: 1, solved: true, isCrown: true, dayIndex: 1, dayLabel: '2025-01-01' },
    { player: '@ace', guesses: 3, solved: true, isCrown: false, dayIndex: 2, dayLabel: '2025-01-02' },
    { player: '@buck', guesses: 2, solved: true, isCrown: true, dayIndex: 2, dayLabel: '2025-01-02' }
  ];
  const context = createCrownContext();
  context.dataset = dataset;
  context.playerMetrics = buildPlayerMetricsMap(dataset);
  context.leaderboard = [
    { place: 1, player: '@ace', winCount: 1, ratio: 0.5 },
    { place: 2, player: '@buck', winCount: 1, ratio: 1 }
  ];

  const badgeCtx = buildBadgeContext(context, '@ace', {
    windowDays: 2,
    metricSources: {
      insights: {
        activeCrownStreak: 1
      }
    }
  });
  const summary = summarizeBadgeContextForDebug(badgeCtx, { maxLeaderboard: 1, maxRows: 1 });

  assert.equal(summary.player, '@ace');
  assert.equal(summary.metrics.totalGames, 2);
  assert.equal(summary.derived.gamesPlayedTarget, 8);
  assert.equal(summary.sourceKeyCounts.insights, 1);
  assert.equal(summary.dataSummary.leaderboardCount, 2);
  assert.equal(summary.leaderboardPreview.length, 1);
  assert.equal(summary.rowPreview.length, 1);
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
    metricSources: {
      insights: {
        activeCrownStreak: 3,
        bestCrownStreak: 5,
        avgGuessWhenCrowned: 2.4,
        participationRate: 0.9
      }
    }
  });

  assert.equal(badges.length, PLAYER_CARD_BADGE_MANIFEST.length);
  assert.ok(badges.every((badge) => typeof badge.progress === 'string' && badge.progress.length > 0));
  assert.ok(badges.every((badge) => typeof badge.requirement === 'string' && badge.requirement.length > 0));
  const badgeCollector = badges.find((badge) => badge.id === 'badge_collector');
  assert.ok(badgeCollector);
  assert.equal(badgeCollector.earned, true);
  assert.equal(badgeCollector.progress, '9 badges earned');
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
    metricSources: {
      insights: {
        activeCrownStreak: 0,
        bestCrownStreak: 0,
        avgGuessWhenCrowned: null,
        participationRate: 0.1
      }
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
    metricSources: {
      insights: {
        activeCrownStreak: 0,
        bestCrownStreak: 0,
        avgGuessWhenCrowned: null,
        participationRate: 0.05
      }
    }
  });

  assert.equal(badges.length, PLAYER_CARD_BADGE_MANIFEST.length);
  assert.ok(badges.every((badge) => typeof badge.progress === 'string' && badge.progress.length > 0));
  assert.ok(badges.every((badge) => typeof badge.requirement === 'string' && badge.requirement.length > 0));
  assert.ok(badges.some((badge) => badge.earned === false));
  assert.equal(badges.find((badge) => badge.id === 'under_five_games').earned, true);
  assert.equal(badges.find((badge) => badge.id === 'top_ten_rank').progress, 'Current rank: 12th (0 crowns)');
  assert.equal(badges.find((badge) => badge.id === 'games_played').progress, '1 games played.');
  assert.equal(badges.find((badge) => badge.id === 'badge_collector').progress, '1 badges earned');
});

test('resolvePlayerCardBadges allows custom metric overrides without expanding ctx shape', () => {
  const dataset = [
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 3, solved: true, isCrown: false },
    { player: '@buck', guesses: 2, solved: true, isCrown: true }
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const badges = resolvePlayerCardBadges(ctx, '@ace', {
    metricSources: {
      insights: {
        activeCrownStreak: 0,
        bestCrownStreak: 0,
        avgGuessWhenCrowned: null,
        participationRate: 0.1
      },
      custom: {
        activeCrownStreak: 4,
        bestCrownStreak: 6,
        avgGuessWhenCrowned: 3.2,
        participationRate: 0.85
      }
    }
  });

  assert.equal(badges.find((badge) => badge.id === 'crown_win_streak').earned, true);
  assert.equal(badges.find((badge) => badge.id === 'efficient_crowns').earned, true);
  assert.equal(badges.find((badge) => badge.id === 'participation_rate').earned, true);
  assert.equal(badges.find((badge) => badge.id === 'crown_win_streak').progress, '6 days.');
  assert.equal(badges.find((badge) => badge.id === 'participation_rate').progress, '85% participation');
  assert.equal(badges.find((badge) => badge.id === 'efficient_crowns').progress, 'Current avg: 3.2 guesses');
});

test('resolvePlayerCardBadges ignores legacy insight option aliases', () => {
  const dataset = [
    { player: '@ace', guesses: 2, solved: true, isCrown: true },
    { player: '@ace', guesses: 3, solved: true, isCrown: false }
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const badges = resolvePlayerCardBadges(ctx, '@ace', {
    insights: {
      activeCrownStreak: 5,
      bestCrownStreak: 5,
      avgGuessWhenCrowned: 2.5,
      participationRate: 1
    }
  });

  assert.equal(badges.find((badge) => badge.id === 'crown_win_streak').earned, false);
  assert.equal(badges.find((badge) => badge.id === 'efficient_crowns').earned, false);
  assert.equal(badges.find((badge) => badge.id === 'participation_rate').earned, false);
});

test('resolvePlayerCardBadges awards most_failed_games to players tied for top fail count', () => {
  const dataset = [
    { player: '@a', solved: false, isCrown: false },
    { player: '@a', solved: false, isCrown: false },
    { player: '@a', guesses: 3, solved: true, isCrown: false },
    { player: '@b', solved: false, isCrown: false },
    { player: '@b', solved: false, isCrown: false },
    { player: '@b', guesses: 2, solved: true, isCrown: true },
    { player: '@c', solved: false, isCrown: false },
    { player: '@c', guesses: 2, solved: true, isCrown: false }
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const badgesA = resolvePlayerCardBadges(ctx, '@a');
  const badgesC = resolvePlayerCardBadges(ctx, '@c');

  const mostFailedA = badgesA.find((badge) => badge.id === 'most_failed_games');
  const mostFailedC = badgesC.find((badge) => badge.id === 'most_failed_games');
  assert.ok(mostFailedA);
  assert.ok(mostFailedC);
  assert.equal(mostFailedA.earned, true);
  assert.equal(mostFailedA.progress, '2 fails (group high: 2)');
  assert.equal(mostFailedC.earned, false);
  assert.equal(mostFailedC.progress, '1 fails (group high: 2)');
});

test('resolvePlayerCardBadges uses strict threshold for high_fail_rate badge', () => {
  const dataset = [
    ...Array.from({ length: 2 }, () => ({ player: '@rate', solved: false, isCrown: false })),
    ...Array.from({ length: 3 }, () => ({ player: '@rate', guesses: 4, solved: true, isCrown: false })),
    ...Array.from({ length: 3 }, () => ({ player: '@edge', solved: false, isCrown: false })),
    ...Array.from({ length: 7 }, () => ({ player: '@edge', guesses: 4, solved: true, isCrown: false }))
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const badgesRate = resolvePlayerCardBadges(ctx, '@rate');
  const badgesEdge = resolvePlayerCardBadges(ctx, '@edge');

  const highFailRate = badgesRate.find((badge) => badge.id === 'high_fail_rate');
  const edgeFailRate = badgesEdge.find((badge) => badge.id === 'high_fail_rate');
  assert.ok(highFailRate);
  assert.ok(edgeFailRate);
  assert.equal(highFailRate.earned, true);
  assert.equal(highFailRate.progress, '40.0% failed');
  assert.equal(edgeFailRate.earned, false);
  assert.equal(edgeFailRate.progress, '30.0% failed');
});

test('resolvePlayerCardBadges awards bucket_master when player leads any crown round', () => {
  const dataset = [
    { player: '@lead', guesses: 1, solved: true, isCrown: true },
    { player: '@lead', guesses: 1, solved: true, isCrown: true },
    { player: '@lead', guesses: 2, solved: true, isCrown: true },
    { player: '@other', guesses: 1, solved: true, isCrown: true },
    { player: '@other', guesses: 2, solved: true, isCrown: true }
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const badgesLead = resolvePlayerCardBadges(ctx, '@lead');
  const badgesOther = resolvePlayerCardBadges(ctx, '@other');

  const leadBucketMaster = badgesLead.find((badge) => badge.id === 'bucket_master');
  const otherBucketMaster = badgesOther.find((badge) => badge.id === 'bucket_master');
  assert.ok(leadBucketMaster);
  assert.ok(otherBucketMaster);
  assert.equal(leadBucketMaster.earned, true);
  assert.equal(leadBucketMaster.progress, 'Leading rounds: 1/6, 2/6');
  assert.deepEqual(leadBucketMaster.roundBreakdownSlots, [
    { round: '1', column: 'crownWins' },
    { round: '2', column: 'crownWins' }
  ]);
  assert.equal(otherBucketMaster.earned, true);
  assert.equal(otherBucketMaster.progress, 'Leading rounds: 2/6');
  assert.deepEqual(otherBucketMaster.roundBreakdownSlots, [
    { round: '2', column: 'crownWins' }
  ]);
});

test('buildRoundBreakdownBadgeMap indexes manifest-provided round slots', () => {
  const map = buildRoundBreakdownBadgeMap([
    {
      id: 'bucket_master',
      icon: '<span class="badgeIcon--goldBucket">🥫</span>',
      earned: true,
      roundBreakdownSlots: [
        { round: '1', column: 'crownWins' },
        { round: '2/6', column: 'crownWins' }
      ]
    },
    {
      id: 'wins_badge',
      icon: '✅',
      earned: true,
      roundBreakdownSlots: [{ round: 'X', column: 'wins' }]
    },
    {
      id: 'locked_bucket',
      icon: '🔒',
      earned: false,
      roundBreakdownSlots: [{ round: '3', column: 'crownWins' }]
    }
  ]);

  assert.equal(map.crownWins['1'].length, 1);
  assert.equal(map.crownWins['1'][0].id, 'bucket_master');
  assert.equal(map.crownWins['2'][0].id, 'bucket_master');
  assert.equal(map.wins.X[0].id, 'wins_badge');
  assert.equal(map.crownWins['3'], undefined);

  const includeLockedMap = buildRoundBreakdownBadgeMap([
    {
      id: 'locked_bucket',
      icon: '🔒',
      earned: false,
      roundBreakdownSlots: [{ round: '3', column: 'crownWins' }]
    }
  ], { includeLocked: true });

  assert.equal(includeLockedMap.crownWins['3'][0].id, 'locked_bucket');
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

test('buildPlayerBadgesMarkup groups earned badges above locked badges', () => {
  const markup = buildPlayerBadgesMarkup(
    [
      { id: 'locked_a', text: 'Locked A', progress: '0/2', requirement: 'Get 2', earned: false },
      { id: 'earned_a', icon: 'A', text: 'Earned A', progress: '2/2', requirement: 'Done', earned: true },
      { id: 'locked_b', text: 'Locked B', progress: '1/3', requirement: 'Get 3', earned: false },
      { id: 'earned_b', icon: 'B', text: 'Earned B', progress: '3/3', requirement: 'Done', earned: true }
    ],
    { maxBadges: 4 }
  );

  const activeHeaderIndex = markup.indexOf('Earned Badges</div>');
  const inactiveHeaderIndex = markup.indexOf('Locked Badges</div>');
  const earnedFirstIndex = markup.indexOf('data-badge-id="earned_a"');
  const lockedFirstIndex = markup.indexOf('data-badge-id="locked_a"');

  assert.ok(activeHeaderIndex >= 0);
  assert.ok(inactiveHeaderIndex > activeHeaderIndex);
  assert.ok(earnedFirstIndex >= 0);
  assert.ok(lockedFirstIndex > earnedFirstIndex);
});
