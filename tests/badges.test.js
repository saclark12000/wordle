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
  buildRoundBreakdownBadgeMap,
  buildLayeredBadgeIcon
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

test('buildLayeredBadgeIcon builds reusable layered icon markup', () => {
  const iconMarkup = buildLayeredBadgeIcon({
    stars: 2
  });

  assert.ok(iconMarkup.includes('badgeIconTier'));
  assert.ok(iconMarkup.includes('badgeIconTier__stars'));
  assert.ok(iconMarkup.includes('badgeIconTier__medal'));
  assert.ok(iconMarkup.includes('data-stars="2"'));
  assert.ok(iconMarkup.includes('data-stars-position="default"'));
  assert.ok(iconMarkup.includes('⭐⭐'));
  assert.ok(iconMarkup.includes('🏅'));
  assert.ok(iconMarkup.indexOf('badgeIconTier__medal') < iconMarkup.indexOf('badgeIconTier__stars'));

  const clampedMarkup = buildLayeredBadgeIcon({ stars: 9 });
  assert.ok(clampedMarkup.includes('data-stars="3"'));
  assert.ok(clampedMarkup.includes('⭐⭐⭐'));

  const zeroMarkup = buildLayeredBadgeIcon({ stars: 0 });
  assert.ok(zeroMarkup.includes('data-stars="0"'));
  assert.ok(!zeroMarkup.includes('badgeIconTier__stars'));

  const customIconMarkup = buildLayeredBadgeIcon({
    stars: 2,
    starsIcon: '🎪',
    medalIcon: '🎱',
    starsPosition: 'over'
  });
  assert.ok(customIconMarkup.includes('🎪🎪'));
  assert.ok(customIconMarkup.includes('🎱'));
  assert.ok(customIconMarkup.includes('badgeIconTier--stars-over'));
  assert.ok(customIconMarkup.includes('data-stars-position="over"'));

  const customUnderMarkup = buildLayeredBadgeIcon({
    stars: 1,
    starsPosition: 'under'
  });
  assert.ok(customUnderMarkup.includes('badgeIconTier--stars-under'));
  assert.ok(customUnderMarkup.includes('data-stars-position="under"'));
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

  assert.equal(badgeCtx.metricNumber('gamesPlayedTarget'), 20);
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
  assert.equal(summary.derived.gamesPlayedTarget, 2);
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
  assert.equal(badgeCollector.progress, '7 badges earned');
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
  assert.equal(badges.find((badge) => badge.id === 'crown_wins_10_place').progress, 'Current rank: 12th (0 crowns)');
  assert.ok(badges.find((badge) => badge.id === 'crown_wins_2-5_place').tierInfo);
  assert.ok(badges.find((badge) => badge.id === 'crown_wins_6-9_place').tierInfo);
  assert.equal(badges.find((badge) => badge.id === 'always_guessing').progress, '5% participation. 1 game played. Tier: 0⭐');
  assert.equal(badges.find((badge) => badge.id === 'badge_collector').progress, '1 badge earned');
});

test('rank badge series replaces top_ten_rank with place-specific tiers', () => {
  const dataset = [];
  const crownCounts = [
    ['@r1', 10],
    ['@r2', 9],
    ['@r3', 8],
    ['@r4', 7],
    ['@r5', 6],
    ['@r6', 5],
    ['@r7', 4],
    ['@r8', 3],
    ['@r9', 2],
    ['@r10', 1],
    ['@r11', 0]
  ];
  crownCounts.forEach(([player, crowns]) => {
    for (let i = 0; i < crowns; i += 1) {
      dataset.push({ player, guesses: 2, solved: true, isCrown: true });
    }
  });
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const rank1 = resolvePlayerCardBadges(ctx, '@r1');
  const rank2 = resolvePlayerCardBadges(ctx, '@r2');
  const rank5 = resolvePlayerCardBadges(ctx, '@r5');
  const rank6 = resolvePlayerCardBadges(ctx, '@r6');
  const rank9 = resolvePlayerCardBadges(ctx, '@r9');
  const rank10 = resolvePlayerCardBadges(ctx, '@r10');
  const rank11 = resolvePlayerCardBadges(ctx, '@r11');

  assert.equal(rank1.find((badge) => badge.id === 'crown_wins_1_place').earned, true);
  assert.equal(rank1.find((badge) => badge.id === 'crown_wins_2-5_place').earned, false);
  assert.equal(rank1.find((badge) => badge.id === 'crown_wins_6-9_place').earned, false);
  assert.equal(rank1.find((badge) => badge.id === 'crown_wins_10_place').earned, false);

  assert.equal(rank2.find((badge) => badge.id === 'crown_wins_2-5_place').earned, true);
  assert.ok(rank2.find((badge) => badge.id === 'crown_wins_2-5_place').icon.includes('data-stars="3"'));
  assert.ok(rank2.find((badge) => badge.id === 'crown_wins_2-5_place').progress.includes('Tier: 3'));

  assert.equal(rank5.find((badge) => badge.id === 'crown_wins_2-5_place').earned, true);
  assert.ok(rank5.find((badge) => badge.id === 'crown_wins_2-5_place').icon.includes('data-stars="0"'));

  assert.equal(rank6.find((badge) => badge.id === 'crown_wins_6-9_place').earned, true);
  assert.ok(rank6.find((badge) => badge.id === 'crown_wins_6-9_place').icon.includes('data-stars="3"'));
  assert.ok(rank6.find((badge) => badge.id === 'crown_wins_6-9_place').progress.includes('Tier: 3'));

  assert.equal(rank9.find((badge) => badge.id === 'crown_wins_6-9_place').earned, true);
  assert.ok(rank9.find((badge) => badge.id === 'crown_wins_6-9_place').icon.includes('data-stars="0"'));

  assert.equal(rank10.find((badge) => badge.id === 'crown_wins_10_place').earned, true);
  assert.equal(rank10.find((badge) => badge.id === 'crown_wins_2-5_place').earned, false);
  assert.equal(rank10.find((badge) => badge.id === 'crown_wins_6-9_place').earned, false);

  assert.equal(rank11.find((badge) => badge.id === 'crown_wins_1_place').earned, false);
  assert.equal(rank11.find((badge) => badge.id === 'crown_wins_2-5_place').earned, false);
  assert.equal(rank11.find((badge) => badge.id === 'crown_wins_6-9_place').earned, false);
  assert.equal(rank11.find((badge) => badge.id === 'crown_wins_10_place').earned, false);
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
  assert.equal(badges.find((badge) => badge.id === 'always_guessing').earned, true);
  assert.equal(badges.find((badge) => badge.id === 'crown_win_streak').progress, '6 days.');
  assert.equal(badges.find((badge) => badge.id === 'always_guessing').progress, '85% participation. 2 games played. Tier: 3⭐');
  assert.ok(badges.find((badge) => badge.id === 'always_guessing').icon.includes('badgeIconTier'));
  assert.ok(badges.find((badge) => badge.id === 'always_guessing').icon.includes('data-stars="3"'));
  assert.equal(badges.find((badge) => badge.id === 'efficient_crowns').progress, 'Current avg: 3.2 guesses');
});

test('resolvePlayerCardBadges uses windowDays in always_guessing requirement copy', () => {
  const dataset = [
    ...Array.from({ length: 9 }, () => ({ player: '@steady', guesses: 3, solved: true, isCrown: false })),
    ...Array.from({ length: 8 }, () => ({ player: '@short', guesses: 3, solved: true, isCrown: false }))
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const badgesSteady = resolvePlayerCardBadges(ctx, '@steady', {
    windowDays: 20,
    metricSources: {
      insights: {
        participationRate: 0.45
      }
    }
  });
  const badgesShort = resolvePlayerCardBadges(ctx, '@short', {
    windowDays: 20,
    metricSources: {
      insights: {
        participationRate: 0.4
      }
    }
  });

  const alwaysGuessingSteady = badgesSteady.find((badge) => badge.id === 'always_guessing');
  const alwaysGuessingShort = badgesShort.find((badge) => badge.id === 'always_guessing');
  assert.ok(alwaysGuessingSteady);
  assert.ok(alwaysGuessingShort);
  assert.equal(alwaysGuessingSteady.earned, true);
  assert.equal(alwaysGuessingSteady.requirement, 'Reach at least 15% participation (3 games).');
  assert.ok(alwaysGuessingSteady.tierInfo);
  assert.ok(alwaysGuessingSteady.tierInfo.includes('15-44%'));
  assert.equal(alwaysGuessingSteady.progress, '45% participation. 9 games played. Tier: 1⭐');
  assert.ok(alwaysGuessingSteady.icon.includes('data-stars="1"'));
  assert.equal(alwaysGuessingShort.earned, true);
  assert.ok(alwaysGuessingShort.tierInfo);
  assert.equal(alwaysGuessingShort.progress, '40% participation. 8 games played. Tier: 0⭐');
  assert.ok(alwaysGuessingShort.icon.includes('data-stars="0"'));
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
  assert.equal(badges.find((badge) => badge.id === 'always_guessing').earned, false);
});

test('always_guessing icon stars follow participation tiers (0-3)', () => {
  const dataset = [
    { player: '@tier', guesses: 3, solved: true, isCrown: false }
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const low = resolvePlayerCardBadges(ctx, '@tier', {
    metricSources: {
      custom: {
        participationRate: 0.2
      }
    }
  }).find((badge) => badge.id === 'always_guessing');

  const mid = resolvePlayerCardBadges(ctx, '@tier', {
    metricSources: {
      custom: {
        participationRate: 0.5
      }
    }
  }).find((badge) => badge.id === 'always_guessing');

  const high = resolvePlayerCardBadges(ctx, '@tier', {
    metricSources: {
      custom: {
        participationRate: 0.7
      }
    }
  }).find((badge) => badge.id === 'always_guessing');

  const top = resolvePlayerCardBadges(ctx, '@tier', {
    metricSources: {
      custom: {
        participationRate: 0.9
      }
    }
  }).find((badge) => badge.id === 'always_guessing');

  assert.ok(low);
  assert.ok(mid);
  assert.ok(high);
  assert.ok(top);
  assert.ok(low.icon.includes('data-stars="0"'));
  assert.ok(mid.icon.includes('data-stars="1"'));
  assert.ok(high.icon.includes('data-stars="2"'));
  assert.ok(top.icon.includes('data-stars="3"'));
  assert.equal(low.earned, true);
  assert.equal(top.earned, true);
});

test('always_guessing remains locked below 15% participation', () => {
  const dataset = [
    { player: '@low', guesses: 3, solved: true, isCrown: false }
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const badge = resolvePlayerCardBadges(ctx, '@low', {
    metricSources: {
      custom: {
        participationRate: 0.14
      }
    }
  }).find((entry) => entry.id === 'always_guessing');

  assert.ok(badge);
  assert.equal(badge.earned, false);
  assert.ok(badge.icon.includes('data-stars="0"'));
});

test('crown_win_ratio icon stars follow crown-ratio tiers (0-3)', () => {
  const dataset = [
    { player: '@ratio', guesses: 3, solved: true, isCrown: true }
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const low = resolvePlayerCardBadges(ctx, '@ratio', {
    metricSources: { custom: { crownRatio: 0.35 } }
  }).find((badge) => badge.id === 'crown_win_ratio');

  const mid = resolvePlayerCardBadges(ctx, '@ratio', {
    metricSources: { custom: { crownRatio: 0.5 } }
  }).find((badge) => badge.id === 'crown_win_ratio');

  const high = resolvePlayerCardBadges(ctx, '@ratio', {
    metricSources: { custom: { crownRatio: 0.65 } }
  }).find((badge) => badge.id === 'crown_win_ratio');

  const top = resolvePlayerCardBadges(ctx, '@ratio', {
    metricSources: { custom: { crownRatio: 0.8 } }
  }).find((badge) => badge.id === 'crown_win_ratio');

  assert.ok(low);
  assert.ok(low.tierInfo);
  assert.ok(low.tierInfo.includes('75%+'));
  assert.ok(mid);
  assert.ok(high);
  assert.ok(top);
  assert.ok(low.icon.includes('data-stars="0"'));
  assert.ok(mid.icon.includes('data-stars="1"'));
  assert.ok(high.icon.includes('data-stars="2"'));
  assert.ok(top.icon.includes('data-stars="3"'));
  assert.ok(low.progress.includes('Tier: 0'));
  assert.ok(mid.progress.includes('Tier: 1'));
  assert.ok(high.progress.includes('Tier: 2'));
  assert.ok(top.progress.includes('Tier: 3'));
  assert.equal(low.earned, true);
  assert.equal(top.earned, true);
});

test('crown_win_ratio remains locked below 30% crown ratio', () => {
  const dataset = [
    { player: '@ratio_low', guesses: 3, solved: true, isCrown: true }
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const badge = resolvePlayerCardBadges(ctx, '@ratio_low', {
    metricSources: { custom: { crownRatio: 0.29 } }
  }).find((entry) => entry.id === 'crown_win_ratio');

  assert.ok(badge);
  assert.equal(badge.earned, false);
  assert.ok(badge.icon.includes('data-stars="0"'));
});

test('sus_wins icon eyes follow one-guess solve tiers (0-3)', () => {
  function susBadgeForCount(count) {
    const dataset = Array.from({ length: count }, () => ({
      player: '@sus',
      guesses: 1,
      solved: true,
      isCrown: false
    }));
    const ctx = createCrownContext();
    ctx.dataset = dataset;
    ctx.playerMetrics = buildPlayerMetricsMap(dataset);
    return resolvePlayerCardBadges(ctx, '@sus').find((badge) => badge.id === 'sus_wins');
  }

  const zero = susBadgeForCount(0);
  const one = susBadgeForCount(1);
  const two = susBadgeForCount(2);
  const three = susBadgeForCount(3);
  const four = susBadgeForCount(4);

  assert.ok(zero);
  assert.equal(zero.earned, false);
  assert.ok(zero.icon.includes('data-stars="0"'));
  assert.ok(zero.icon.includes('data-stars-position="under"'));
  assert.ok(zero.icon.includes('badgeIconTier--stars-under'));
  assert.ok(zero.progress.includes('Tier: 0'));

  assert.ok(one);
  assert.equal(one.earned, true);
  assert.ok(one.tierInfo);
  assert.ok(one.tierInfo.includes('4+'));
  assert.ok(one.icon.includes('data-stars="0"'));
  assert.ok(one.icon.includes('data-stars-position="under"'));
  assert.ok(one.progress.includes('Tier: 0'));

  assert.ok(two.icon.includes('data-stars="1"'));
  assert.ok(two.progress.includes('Tier: 1'));

  assert.ok(three.icon.includes('data-stars="2"'));
  assert.ok(three.progress.includes('Tier: 2'));

  assert.ok(four.icon.includes('data-stars="3"'));
  assert.ok(four.progress.includes('Tier: 3'));
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
  assert.equal(mostFailedA.tierInfo, undefined);
  assert.ok(!mostFailedA.icon.includes('data-stars="'));
  assert.equal(mostFailedC.earned, false);
  assert.equal(mostFailedC.progress, '1 fail (group high: 2)');
  assert.ok(!mostFailedC.icon.includes('data-stars="'));
});

test('failed_games icon stars follow fail-count tiers (0-3) when player is group high', () => {
  function failedGamesBadgeForTopFailCount(topFailCount) {
    const dataset = [
      ...Array.from({ length: topFailCount }, () => ({ player: '@top', solved: false, isCrown: false })),
      ...Array.from({ length: Math.max(0, topFailCount - 1) }, () => ({ player: '@other', solved: false, isCrown: false })),
      { player: '@top', guesses: 3, solved: true, isCrown: false },
      { player: '@other', guesses: 3, solved: true, isCrown: false }
    ];
    const ctx = createCrownContext();
    ctx.dataset = dataset;
    ctx.playerMetrics = buildPlayerMetricsMap(dataset);
    return resolvePlayerCardBadges(ctx, '@top').find((badge) => badge.id === 'failed_games');
  }

  const one = failedGamesBadgeForTopFailCount(1);
  const four = failedGamesBadgeForTopFailCount(4);
  const eight = failedGamesBadgeForTopFailCount(8);
  const sixteen = failedGamesBadgeForTopFailCount(16);

  assert.ok(one);
  assert.equal(one.earned, true);
  assert.ok(one.tierInfo);
  assert.ok(one.tierInfo.includes('16+'));
  assert.ok(one.icon.includes('data-stars="0"'));
  assert.ok(one.progress.includes('Tier: 0'));

  assert.ok(four.icon.includes('data-stars="1"'));
  assert.ok(four.progress.includes('Tier: 1'));

  assert.ok(eight.icon.includes('data-stars="2"'));
  assert.ok(eight.progress.includes('Tier: 2'));

  assert.ok(sixteen.icon.includes('data-stars="3"'));
  assert.ok(sixteen.progress.includes('Tier: 3'));
});

test('failed_games remains locked when failGames is zero', () => {
  const dataset = [
    { player: '@rate', solved: false, isCrown: false },
    { player: '@rate', guesses: 4, solved: true, isCrown: false },
    { player: '@edge', guesses: 4, solved: true, isCrown: false },
    { player: '@edge', guesses: 5, solved: true, isCrown: false }
  ];
  const ctx = createCrownContext();
  ctx.dataset = dataset;
  ctx.playerMetrics = buildPlayerMetricsMap(dataset);

  const badgesRate = resolvePlayerCardBadges(ctx, '@rate');
  const badgesEdge = resolvePlayerCardBadges(ctx, '@edge');

  const failedRate = badgesRate.find((badge) => badge.id === 'failed_games');
  const failedEdge = badgesEdge.find((badge) => badge.id === 'failed_games');
  assert.ok(failedRate);
  assert.ok(failedEdge);
  assert.equal(failedRate.earned, true);
  assert.equal(failedEdge.earned, false);
  assert.ok(failedRate.progress.includes('Tier: 0'));
  assert.ok(failedEdge.progress.includes('Tier: 0'));
});

test('resolvePlayerCardBadges awards bucket_master when player leads a non-1/6 crown round', () => {
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
  assert.ok(leadBucketMaster.tierInfo);
  assert.ok(leadBucketMaster.tierInfo.includes('1 lead'));
  assert.ok(otherBucketMaster);
  assert.equal(leadBucketMaster.earned, true);
  assert.equal(leadBucketMaster.progress, 'Leading rounds: 2/6. Tier: 0⚙');
  assert.ok(leadBucketMaster.requirement.includes('non-1/6 round'));
  assert.ok(leadBucketMaster.icon.includes('badgeIconTier'));
  assert.ok(leadBucketMaster.icon.includes('badgeIcon--goldBucket'));
  assert.ok(leadBucketMaster.icon.includes('data-stars="0"'));
  assert.deepEqual(leadBucketMaster.roundBreakdownSlots, [
    { round: '1', column: 'crownWins' },
    { round: '2', column: 'crownWins' }
  ]);
  assert.equal(otherBucketMaster.earned, true);
  assert.equal(otherBucketMaster.progress, 'Leading rounds: 2/6. Tier: 0⚙');
  assert.ok(otherBucketMaster.icon.includes('data-stars="0"'));
  assert.deepEqual(otherBucketMaster.roundBreakdownSlots, [
    { round: '2', column: 'crownWins' }
  ]);
});

test('bucket_master icon stars follow leading-round tiers (0-3)', () => {
  const scenarios = [
    { rounds: [2], stars: 0 },
    { rounds: [2, 3], stars: 1 },
    { rounds: [2, 3, 4], stars: 2 },
    { rounds: [2, 3, 4, 5], stars: 3 }
  ];

  scenarios.forEach(({ rounds, stars }) => {
    const dataset = [];
    rounds.forEach((guessBucket) => {
      dataset.push({ player: '@tier', guesses: guessBucket, solved: true, isCrown: true });
      dataset.push({ player: '@tier', guesses: guessBucket, solved: true, isCrown: true });
      dataset.push({ player: '@other', guesses: guessBucket, solved: true, isCrown: true });
    });
    const ctx = createCrownContext();
    ctx.dataset = dataset;
    ctx.playerMetrics = buildPlayerMetricsMap(dataset);

    const bucketMaster = resolvePlayerCardBadges(ctx, '@tier').find((badge) => badge.id === 'bucket_master');
    assert.ok(bucketMaster);
    assert.equal(bucketMaster.earned, true);
    assert.ok(bucketMaster.icon.includes('badgeIconTier'));
    assert.ok(bucketMaster.icon.includes('badgeIcon--goldBucket'));
    assert.ok(bucketMaster.icon.includes(`data-stars="${stars}"`));
    assert.ok(bucketMaster.progress.includes(`Tier: ${stars}⚙`));
  });
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
  assert.ok(!markup.includes('Tier Ladder'));
});

test('buildPlayerBadgesMarkup renders Tier Ladder row only for tiered badges', () => {
  const markup = buildPlayerBadgesMarkup(
    [
      {
        id: 'tiered',
        icon: 'B',
        text: 'Tiered',
        progress: 'Tier 1',
        requirement: 'Reach threshold',
        tierInfo: '0-star: 1 lead, 1-star: 2 leads, 2-star: 3 leads, 3-star: 4 leads',
        earned: true
      },
      {
        id: 'plain',
        icon: 'P',
        text: 'Plain',
        progress: 'Current avg: 3.8 guesses',
        requirement: 'Keep average guesses when crowned at 4 or lower.',
        earned: true
      }
    ],
    { maxBadges: 2 }
  );

  assert.ok(markup.includes('Tier Ladder'));
  assert.ok(markup.includes('0-star: 1 lead, 1-star: 2 leads, 2-star: 3 leads, 3-star: 4 leads'));
  assert.equal((markup.match(/Tier Ladder/g) || []).length, 1);
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

