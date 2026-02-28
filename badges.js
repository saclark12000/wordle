(function (global) {
  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function iconFromCodePoint(codePoint) {
    return String.fromCodePoint(codePoint);
  }

  const CROWN_GUESS_BUCKETS = ['1', '2', '3', '4', '5', '6'];

  function formatGuessBucketLabel(bucketKey) {
    return `${bucketKey}/6`;
  }

  function buildLeaderboardRankings(metricsMap) {
    const rankings = {
      crownGuessLeaders: {},
      playerGuessLeaders: {}
    };
    CROWN_GUESS_BUCKETS.forEach((bucketKey) => {
      const label = formatGuessBucketLabel(bucketKey);
      rankings.crownGuessLeaders[label] = { leaders: [], winCount: 0 };
    });
    if (!(metricsMap instanceof Map) || metricsMap.size === 0) {
      return rankings;
    }
    CROWN_GUESS_BUCKETS.forEach((bucketKey) => {
      const label = formatGuessBucketLabel(bucketKey);
      let best = 0;
      let leaders = [];
      metricsMap.forEach((metrics, player) => {
        const bucketCount = Number(metrics && metrics.crownBuckets ? metrics.crownBuckets[bucketKey] : 0) || 0;
        if (bucketCount <= 0) return;
        if (bucketCount > best) {
          best = bucketCount;
          leaders = [player];
        } else if (bucketCount === best) {
          leaders.push(player);
        }
      });
      leaders.sort((a, b) => a.localeCompare(b));
      rankings.crownGuessLeaders[label].leaders = leaders;
      rankings.crownGuessLeaders[label].winCount = best;
      leaders.forEach((player) => {
        if (!rankings.playerGuessLeaders[player]) {
          rankings.playerGuessLeaders[player] = {};
        }
        rankings.playerGuessLeaders[player][label] = true;
      });
    });
    return rankings;
  }

  function attachLeaderboardRankings(leaderboard, metricsMap) {
    const target = Array.isArray(leaderboard) ? leaderboard : [];
    target.rankings = buildLeaderboardRankings(metricsMap);
    return target;
  }

  function createCrownContext() {
    const leaderboard = [];
    attachLeaderboardRankings(leaderboard, null);
    return {
      leaderboard,
      dataset: [],
      selectedPlayer: null,
      playerMetrics: new Map(),
      badgeMetricSources: {
        core: {},
        insights: {},
        derived: {},
        custom: {}
      }
    };
  }

  function createEmptyPlayerMetrics(player, opts) {
    const keys = ['1', '2', '3', '4', '5', '6', 'X'];
    const trackRows = !opts || opts.trackRows !== false;
    return {
      player,
      totalGames: 0,
      solvedGames: 0,
      failGames: 0,
      crownWins: 0,
      susWins: 0,
      winRatio: 0,
      buckets: Object.fromEntries(keys.map((k) => [k, 0])),
      crownBuckets: Object.fromEntries(keys.map((k) => [k, 0])),
      rows: trackRows ? [] : null
    };
  }

  function updatePlayerMetricsFromRow(metrics, row) {
    if (!metrics || !row) return;
    metrics.totalGames += 1;
    if (Array.isArray(metrics.rows)) {
      metrics.rows.push(row);
    }
    const solved = !!row.solved;
    const bucketKey = solved && row.guesses ? String(row.guesses) : 'X';
    if (metrics.buckets[bucketKey] !== undefined) {
      metrics.buckets[bucketKey] += 1;
    }
    if (solved) {
      metrics.solvedGames += 1;
    } else {
      metrics.failGames += 1;
    }
    if (row.guesses === 1) {
      metrics.susWins += 1;
    }
    if (row.isCrown) {
      metrics.crownWins += 1;
      if (metrics.crownBuckets[bucketKey] !== undefined) {
        metrics.crownBuckets[bucketKey] += 1;
      }
    }
    metrics.winRatio = metrics.totalGames ? Math.round(metrics.crownWins / metrics.totalGames) : 0;
  }

  function buildPlayerMetricsMap(dataset) {
    const out = new Map();
    for (const row of dataset || []) {
      if (!row.player) continue;
      if (!out.has(row.player)) {
        out.set(row.player, createEmptyPlayerMetrics(row.player));
      }
      updatePlayerMetricsFromRow(out.get(row.player), row);
    }
    return out;
  }

  function getPlayerMetrics(context, player) {
    if (!player) return createEmptyPlayerMetrics(null);
    const metricsMap = context && context.playerMetrics instanceof Map ? context.playerMetrics : null;
    if (metricsMap && metricsMap.has(player)) {
      return metricsMap.get(player);
    }
    const dataset = context && Array.isArray(context.dataset) ? context.dataset : [];
    const metrics = createEmptyPlayerMetrics(player);
    for (const row of dataset) {
      if (row.player !== player) continue;
      updatePlayerMetricsFromRow(metrics, row);
    }
    return metrics;
  }

  function getOrdinal(n) {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  }

  function formatPercent(value, digits = 0) {
    if (!Number.isFinite(value)) return '0%';
    return `${(value * 100).toFixed(digits)}%`;
  }

  const BADGE_METRIC_NAMESPACE_ORDER = ['custom', 'insights', 'derived', 'core'];

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneMetricSource(value) {
    if (!isPlainObject(value)) return {};
    return { ...value };
  }

  function mergeMetricSource(target, source) {
    if (!isPlainObject(target) || !isPlainObject(source)) return target;
    Object.keys(source).forEach((key) => {
      target[key] = source[key];
    });
    return target;
  }

  function mergeNamespacedMetricSources(target, source) {
    if (!isPlainObject(target) || !isPlainObject(source)) return target;
    const hasNamespaces = BADGE_METRIC_NAMESPACE_ORDER.some((namespace) => isPlainObject(source[namespace]));
    if (hasNamespaces) {
      BADGE_METRIC_NAMESPACE_ORDER.forEach((namespace) => {
        mergeMetricSource(target[namespace], source[namespace]);
      });
      return target;
    }
    mergeMetricSource(target.custom, source);
    return target;
  }

  function getMetricFromPath(source, path) {
    if (!source || path === null || path === undefined) return undefined;
    const key = String(path).trim();
    if (!key) return undefined;
    if (!key.includes('.')) {
      return source[key];
    }
    const parts = key.split('.');
    let cursor = source;
    for (const part of parts) {
      if (!cursor || (typeof cursor !== 'object' && !Array.isArray(cursor))) {
        return undefined;
      }
      cursor = cursor[part];
      if (cursor === undefined) return undefined;
    }
    return cursor;
  }

  function flattenMetricSources(sources) {
    const flattened = {};
    mergeMetricSource(flattened, sources && sources.core);
    mergeMetricSource(flattened, sources && sources.derived);
    mergeMetricSource(flattened, sources && sources.insights);
    mergeMetricSource(flattened, sources && sources.custom);
    return flattened;
  }

  function createBadgeMetricRegistry(inputSources = {}) {
    const sources = {
      core: cloneMetricSource(inputSources.core),
      insights: cloneMetricSource(inputSources.insights),
      derived: cloneMetricSource(inputSources.derived),
      custom: cloneMetricSource(inputSources.custom)
    };

    function get(key, fallback) {
      const normalizedKey = key === null || key === undefined ? '' : String(key).trim();
      if (!normalizedKey) return fallback;
      if (normalizedKey.includes('.')) {
        const namespacedValue = getMetricFromPath(sources, normalizedKey);
        if (namespacedValue !== undefined) {
          return namespacedValue;
        }
      }
      for (const namespace of BADGE_METRIC_NAMESPACE_ORDER) {
        const value = getMetricFromPath(sources[namespace], normalizedKey);
        if (value !== undefined) {
          return value;
        }
      }
      return fallback;
    }

    function getNumber(key, fallback = 0) {
      const raw = get(key, fallback);
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
      const parsedFallback = Number(fallback);
      return Number.isFinite(parsedFallback) ? parsedFallback : 0;
    }

    function has(key) {
      const marker = Symbol('missing-badge-metric');
      return get(key, marker) !== marker;
    }

    return {
      sources,
      values: flattenMetricSources(sources),
      get,
      getNumber,
      has
    };
  }

  function computeGamesPlayedTarget(windowDays) {
    const parsedWindowDays = Number(windowDays) || 0;
    if (parsedWindowDays > 0) {
      return Math.max(8, Math.round(parsedWindowDays * 0.6));
    }
    return 10;
  }

  function getPlayerRank(metricsMap, player) {
    if (!(metricsMap instanceof Map) || !player) return null;
    const ranked = [...metricsMap.entries()]
      .map(([name, metrics]) => ({
        player: name,
        crownWins: Number(metrics && metrics.crownWins) || 0
      }))
      .sort((a, b) => {
        if (b.crownWins !== a.crownWins) return b.crownWins - a.crownWins;
        return a.player.localeCompare(b.player);
      });
    const index = ranked.findIndex((entry) => entry.player === player);
    return index >= 0 ? index + 1 : null;
  }

  function resolveBadgeField(value, ctx) {
    if (typeof value === 'function') {
      return value(ctx, BADGE_HELPERS);
    }
    return value;
  }

  function getGamesPlayedTarget(ctx) {
    const metricValue = getMetricNumber(ctx, 'gamesPlayedTarget', NaN);
    if (Number.isFinite(metricValue) && metricValue > 0) {
      return Math.round(metricValue);
    }
    return 10;
  }

  function getCrownRatio(metrics) {
    if (!metrics || !metrics.totalGames) return 0;
    return metrics.crownWins / metrics.totalGames;
  }

  function getFailRatio(metrics) {
    if (!metrics || !metrics.totalGames) return 0;
    return metrics.failGames / metrics.totalGames;
  }

  function getMaxFailGames(metricsMap) {
    if (!(metricsMap instanceof Map) || metricsMap.size === 0) return 0;
    let maxFailGames = 0;
    metricsMap.forEach((playerMetrics) => {
      const failGames = Number(playerMetrics && playerMetrics.failGames) || 0;
      if (failGames > maxFailGames) {
        maxFailGames = failGames;
      }
    });
    return maxFailGames;
  }

  function getMetricValue(ctx, key, fallback) {
    if (ctx && typeof ctx.metric === 'function') {
      return ctx.metric(key, fallback);
    }
    return fallback;
  }

  function getMetricNumber(ctx, key, fallback = 0) {
    if (ctx && typeof ctx.metricNumber === 'function') {
      return ctx.metricNumber(key, fallback);
    }
    const parsed = Number(fallback);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const BADGE_HELPERS = {
    ordinal: getOrdinal,
    ratioPercent: (wins, total) => {
      if (!total) return '0%';
      return `${((wins / total) * 100).toFixed(0)}%`;
    },
    percent: formatPercent,
    metricNumber: (value) => {
      if (!Number.isFinite(value)) return '0';
      return `${Math.round(value)}`;
    },
    metric: (ctx, key, fallback) => getMetricValue(ctx, key, fallback),
    metricNumberFrom: (ctx, key, fallback = 0) => getMetricNumber(ctx, key, fallback)
  };

  const PLAYER_CARD_BADGE_MANIFEST = [
    {
      id: 'top_ten_rank',
      icon: () => iconFromCodePoint(0x1f3c5),
      title: (ctx) => {
        const playerRank = getMetricNumber(ctx, 'playerRank', 0);
        return playerRank ? `${getOrdinal(playerRank)} Place` : 'Top 10 Rank';
      },
      description: (ctx) => `${ctx.player} has ${getMetricNumber(ctx, 'crownWins', 0)} crowns this window.`,
      requirement: 'Finish in the top 10 for crown wins in this window.',
      progress: (ctx) => {
        const playerRank = getMetricNumber(ctx, 'playerRank', 0);
        if (!playerRank) return 'Current rank: --';
        return `Current rank: ${getOrdinal(playerRank)} (${getMetricNumber(ctx, 'crownWins', 0)} crowns)`;
      },
      predicate: (ctx) => {
        const playerRank = getMetricNumber(ctx, 'playerRank', 0);
        return playerRank > 0 && playerRank <= 10;
      }
    },
    {
      id: 'crown_ratio',
      icon: '💰',
      title: 'Crown Ratio',
      description: (ctx) => `${ctx.player}'s crown win percentage.`,
      requirement: 'At least 30% of all wins are crown wins.',
      progress: (ctx) => `${formatPercent(getMetricNumber(ctx, 'crownRatio', 0), 1)}`,
      predicate: (ctx) => getMetricNumber(ctx, 'crownRatio', 0) >= 0.3
    },
    {
      id: 'sus_wins',
      icon: () => iconFromCodePoint(0x1f440),
      title: 'Sus Wins',
      description: (ctx) => `${ctx.player}'s one-guess #wordle-hurdle solves.`,
      requirement: 'Get at least a single one-guess solve.',
      progress: (ctx) => `${getMetricNumber(ctx, 'susWins', 0)} one-guess solves`,
      predicate: (ctx) => getMetricNumber(ctx, 'susWins', 0) >= 1
    },
    {
      id: 'games_played',
      icon: () => iconFromCodePoint(0x1f4c5),
      title: 'Games Played',
      description: (ctx) => `${ctx.player} #wordle-hurdle participation.`,
      requirement: (ctx) => `Play at least ${getGamesPlayedTarget(ctx)} games.`,
      progress: (ctx) => `${getMetricNumber(ctx, 'totalGames', 0)} games played.`,
      predicate: (ctx) => getMetricNumber(ctx, 'totalGames', 0) >= getGamesPlayedTarget(ctx)
    },
    {
      id: 'most_failed_games',
      icon: () => '<span class="badgeIcon--darkBlueCrown">👑</span>',
      title: 'Most Failed Games',
      description: (ctx) => `${ctx.player}'s failed game count compared to the group.`,
      requirement: 'Have the most failed games in this window.',
      progress: (ctx) => `${getMetricNumber(ctx, 'failGames', 0)} fails (group high: ${getMetricNumber(ctx, 'maxFailGames', 0)})`,
      predicate: (ctx) => {
        const failGames = getMetricNumber(ctx, 'failGames', 0);
        const maxFailGames = getMetricNumber(ctx, 'maxFailGames', 0);
        return failGames > 0 && maxFailGames > 0 && failGames === maxFailGames;
      }
    },
    {
      id: 'high_fail_rate',
      icon: () => iconFromCodePoint(0x26a0),
      title: 'High Fail Rate',
      description: (ctx) => `${ctx.player}'s failed game percentage.`,
      requirement: 'Fail more than 30% of games played.',
      progress: (ctx) => `${formatPercent(getMetricNumber(ctx, 'failRatio', 0), 1)} failed`,
      predicate: (ctx) => getMetricNumber(ctx, 'failRatio', 0) > 0.3
    },
    {
      id: 'crown_conversion',
      icon: () => "🎯",
      title: 'Sharp Shooter',
      description: (ctx) => `${ctx.player} crown-win percentage.`,
      requirement: 'At least 30% of all wins are crown wins.',
      progress: (ctx) => `${formatPercent(getMetricNumber(ctx, 'crownRatio', 0), 1)}`,
      predicate: (ctx) => getMetricNumber(ctx, 'crownRatio', 0) >= 0.3
    },
    {
      id: 'best_streak',
      icon: () => iconFromCodePoint(0x1f6e1),
      title: 'Best Crown Streak',
      description: (ctx) => `${ctx.player}'s best crown streak.`,
      requirement: 'Gain crown wins for at least 5 days in a row.',
      progress: (ctx) => `${getMetricNumber(ctx, 'bestCrownStreak', 0)} days.`,
      predicate: (ctx) => getMetricNumber(ctx, 'bestCrownStreak', 0) >= 5
    },
    {
      id: 'under_five_games',
      icon: () => iconFromCodePoint(0x1f331),
      title: 'Fresh Player',
      description: (ctx) => `${ctx.player} has fewer than 5 #wordle-hurdle games.`,
      requirement: 'Play fewer than 5 games.',
      progress: (ctx) => `${ctx.metricNumber('totalGames', 0)} games played.`,
      predicate: (ctx) => ctx.metricNumber('totalGames', 0) < 5
    },
    {
      id: 'efficient_crowns',
      icon: '🗄',
      title: 'Crown Efficiency',
      description: (ctx) => `${ctx.player}'s average guesses on crowned wins.`,
      requirement: 'Keep average guesses when crowned at 4 or lower.',
      progress: (ctx) => {
        const raw = getMetricValue(ctx, 'avgGuessWhenCrowned', null);
        const avg = Number(raw);
        if (raw === null || raw === undefined || raw === '') return 'No crowned solves yet';
        if (!Number.isFinite(avg)) return 'No crowned solves yet';
        return `Current avg: ${avg.toFixed(1)} guesses`;
      },
      predicate: (ctx) => {
        const raw = getMetricValue(ctx, 'avgGuessWhenCrowned', null);
        const avg = Number(raw);
        if (raw === null || raw === undefined || raw === '') return false;
        return Number.isFinite(avg) && avg < 4;
      }
    },
    {
      id: 'participation_rate',
      icon: () => iconFromCodePoint(0x1f4ca),
      title: 'Participation Rate',
      description: (ctx) => `${ctx.player}'s #wordle-hurdle participation.`,
      requirement: 'Participate in at least 85% of days.',
      progress: (ctx) => `${formatPercent(getMetricNumber(ctx, 'participationRate', 0), 0)} participation`,
      predicate: (ctx) => getMetricNumber(ctx, 'participationRate', 0) >= 0.85
    },
    {
      id: 'bucket_master',
      icon: () => '<span class="badgeIcon--goldBucket">🥫</span>',
      title: 'Bucket Master',
      description: (ctx) => `${ctx.player}'s #wordle-hurdle bucket mastery.`,
      requirement: 'Lead the group in crown wins for at least one round.',
      progress: (ctx) => {
        const leadingRounds = getBucketMasterRounds(ctx);
        if (!leadingRounds.length) return 'No round leads yet';
        return `Leading rounds: ${leadingRounds.join(', ')}`;
      },
      predicate: (ctx) => getBucketMasterRounds(ctx).length > 0
    },
    {
      id: 'badge_collector',
      icon: '🎁',
      title: 'Badge Collector',
      requirement: 'Earn at least 5 badges.',
      progress: (ctx, helpers) => `${helpers.metricNumber(ctx.badgeState && ctx.badgeState.earnedBadgeCount)} badges earned`,
      predicate: (ctx) => Number(ctx.badgeState && ctx.badgeState.earnedBadgeCount) >= 5
    }
  ];

  function getBucketMasterRounds(ctx) {
    const metricsMap = ctx && ctx.data && ctx.data.metricsMap instanceof Map
      ? ctx.data.metricsMap
      : null;
    const player = ctx && ctx.player ? ctx.player : null;
    if (!metricsMap || !player || !metricsMap.has(player)) return [];

    const playerMetrics = metricsMap.get(player);
    const playerCrownBuckets = playerMetrics && playerMetrics.crownBuckets
      ? playerMetrics.crownBuckets
      : {};
    const leadingRounds = [];

    CROWN_GUESS_BUCKETS.forEach((bucketKey) => {
      const playerRoundWins = Number(playerCrownBuckets[bucketKey]) || 0;
      if (playerRoundWins <= 0) return;

      let groupMaxRoundWins = 0;
      metricsMap.forEach((metrics) => {
        const roundWins = Number(metrics && metrics.crownBuckets ? metrics.crownBuckets[bucketKey] : 0) || 0;
        if (roundWins > groupMaxRoundWins) {
          groupMaxRoundWins = roundWins;
        }
      });

      if (groupMaxRoundWins > 0 && playerRoundWins === groupMaxRoundWins) {
        leadingRounds.push(formatGuessBucketLabel(bucketKey));
      }
    });

    return leadingRounds;
  }

  function buildBadgePayload(entry, ctx, opts = {}) {
    const earned = opts.earned !== false;
    const fieldCtx = { ...ctx, earned };
    const title = resolveBadgeField(entry.title, fieldCtx);
    const description = resolveBadgeField(entry.description, fieldCtx);
    const requirement = resolveBadgeField(entry.requirement, fieldCtx);
    const progress = resolveBadgeField(entry.progress, fieldCtx);
    const image = resolveBadgeField(
      !earned && entry.lockedImage !== undefined ? entry.lockedImage : entry.image,
      fieldCtx
    );
    const icon = resolveBadgeField(
      !earned && entry.lockedIcon !== undefined ? entry.lockedIcon : entry.icon,
      fieldCtx
    );
    if (!title && !icon && !image && !progress) return null;
    return {
      id: entry.id,
      icon,
      image,
      text: title,
      description,
      requirement,
      progress,
      alt: resolveBadgeField(entry.alt, fieldCtx),
      ariaLabel: resolveBadgeField(entry.ariaLabel, fieldCtx),
      earned
    };
  }

  function evaluateBadges(manifest, ctx, opts = {}) {
    const includeLocked = !!opts.includeLocked;
    const requestedLimit = Number(opts.maxBadges);
    const maxBadges = Number.isFinite(requestedLimit) ? Math.max(1, Math.floor(requestedLimit)) : 1;
    const badgeEntries = Array.isArray(manifest) ? manifest.filter(Boolean) : [];
    const matches = [];
    const evaluated = [];
    const collectorEntries = [];

    function runPredicate(entry, predicateCtx) {
      let earned = false;
      try {
        earned = !!entry.predicate(predicateCtx, BADGE_HELPERS);
      } catch (err) {
        console.warn('Badge predicate failed', entry.id, err);
        return false;
      }
      return earned;
    }

    for (const entry of badgeEntries) {
      if (typeof entry.predicate !== 'function') continue;
      if (entry.id === 'badge_collector') {
        collectorEntries.push(entry);
        continue;
      }
      evaluated.push({ entry, earned: runPredicate(entry, ctx) });
    }

    const earnedBadgeIds = evaluated
      .filter((item) => item.earned)
      .map((item) => item.entry.id)
      .filter(Boolean);
    const badgeState = {
      earnedBadgeIds,
      earnedBadgeCount: earnedBadgeIds.length
    };
    const enrichedCtx = {
      ...ctx,
      badgeState
    };

    for (const entry of collectorEntries) {
      evaluated.push({ entry, earned: runPredicate(entry, enrichedCtx) });
    }

    for (const item of evaluated) {
      if (!item.earned && !includeLocked) continue;
      const payload = buildBadgePayload(item.entry, enrichedCtx, { earned: item.earned });
      if (!payload) continue;
      matches.push(payload);
      if (matches.length >= maxBadges) break;
    }
    return matches;
  }

  function createMetricSourceContainer(defaultSources = {}) {
    return {
      core: cloneMetricSource(defaultSources.core),
      insights: cloneMetricSource(defaultSources.insights),
      derived: cloneMetricSource(defaultSources.derived),
      custom: cloneMetricSource(defaultSources.custom)
    };
  }

  function collectBadgeMetricSources(context, opts, defaultSources) {
    const sources = createMetricSourceContainer(defaultSources);
    mergeNamespacedMetricSources(sources, context && context.badgeMetricSources);
    mergeNamespacedMetricSources(sources, opts && opts.metricSources);
    return sources;
  }

  function buildBadgeContext(context = {}, player, opts = {}) {
    const leaderboard = Array.isArray(context.leaderboard) ? context.leaderboard : [];
    const dataset = Array.isArray(context.dataset) ? context.dataset : [];
    const metricsMap = context && context.playerMetrics instanceof Map ? context.playerMetrics : buildPlayerMetricsMap(dataset);
    if (metricsMap && context && !(context.playerMetrics instanceof Map)) {
      try {
        context.playerMetrics = metricsMap;
      } catch (err) {
        // non-fatal if the caller provided an immutable context
      }
    }
    attachLeaderboardRankings(leaderboard, metricsMap);
    const leaderboardEntry = leaderboard.find((entry) => entry.player === player) || null;
    const metrics = getPlayerMetrics(context, player);
    const rows = metrics && Array.isArray(metrics.rows) ? metrics.rows : [];
    const windowDays = Number(opts.windowDays || (context && context.windowDays)) || 0;
    const playerRank = getPlayerRank(metricsMap, player);
    const defaultMetricSources = {
      core: {
        ...metrics,
        playerRank,
        windowDays
      },
      insights: {},
      derived: {
        crownRatio: getCrownRatio(metrics),
        failRatio: getFailRatio(metrics),
        gamesPlayedTarget: computeGamesPlayedTarget(windowDays),
        playerRank,
        maxFailGames: getMaxFailGames(metricsMap)
      },
      custom: {}
    };
    const collectedMetricSources = collectBadgeMetricSources(context, opts, defaultMetricSources);
    const metricRegistry = createBadgeMetricRegistry(collectedMetricSources);
    const badgeDataContext = {
      leaderboard,
      dataset,
      leaderboardEntry,
      rows,
      metricsMap
    };
    return {
      player,
      metricSources: metricRegistry.sources,
      metricValues: metricRegistry.values,
      metric: metricRegistry.get,
      metricNumber: metricRegistry.getNumber,
      hasMetric: metricRegistry.has,
      data: badgeDataContext,
      badgeState: {
        earnedBadgeIds: [],
        earnedBadgeCount: 0
      }
    };
  }

  function summarizeBadgeContextForDebug(ctx, opts = {}) {
    const maxLeaderboard = Math.max(1, Number(opts.maxLeaderboard) || 10);
    const maxRows = Math.max(1, Number(opts.maxRows) || 8);
    if (!ctx || typeof ctx !== 'object') {
      return {
        player: null,
        error: 'No badge context provided.'
      };
    }

    const data = ctx.data && typeof ctx.data === 'object' ? ctx.data : {};
    const metricSources = ctx.metricSources && typeof ctx.metricSources === 'object'
      ? ctx.metricSources
      : { core: {}, derived: {}, insights: {}, custom: {} };
    const coreMetrics = metricSources.core || {};
    const derivedMetrics = metricSources.derived || {};
    const badgeState = ctx.badgeState || { earnedBadgeIds: [], earnedBadgeCount: 0 };
    const leaderboard = Array.isArray(data.leaderboard) ? data.leaderboard : [];
    const rows = Array.isArray(data.rows) ? data.rows : [];

    const leaderboardPreview = leaderboard
      .slice(0, maxLeaderboard)
      .map((entry) => ({
        player: entry && entry.player ? entry.player : '',
        place: Number(entry && entry.place) || 0,
        winCount: Number(entry && entry.winCount) || 0,
        ratio: Number(entry && entry.ratio) || 0
      }));

    const rowPreview = rows
      .slice(0, maxRows)
      .map((row) => ({
        dayLabel: row && row.dayLabel ? row.dayLabel : '',
        dayIndex: Number(row && row.dayIndex) || 0,
        guesses: row && row.guesses !== undefined ? row.guesses : null,
        solved: !!(row && row.solved),
        isCrown: !!(row && row.isCrown)
      }));

    return {
      player: ctx.player || null,
      badgeState: {
        earnedBadgeCount: Number(badgeState.earnedBadgeCount) || 0,
        earnedBadgeIds: Array.isArray(badgeState.earnedBadgeIds) ? [...badgeState.earnedBadgeIds] : []
      },
      metrics: {
        totalGames: Number(coreMetrics.totalGames) || 0,
        solvedGames: Number(coreMetrics.solvedGames) || 0,
        failGames: Number(coreMetrics.failGames) || 0,
        crownWins: Number(coreMetrics.crownWins) || 0,
        susWins: Number(coreMetrics.susWins) || 0,
        playerRank: Number(coreMetrics.playerRank) || 0,
        windowDays: Number(coreMetrics.windowDays) || 0
      },
      derived: {
        crownRatio: Number(derivedMetrics.crownRatio) || 0,
        failRatio: Number(derivedMetrics.failRatio) || 0,
        gamesPlayedTarget: Number(derivedMetrics.gamesPlayedTarget) || 0,
        maxFailGames: Number(derivedMetrics.maxFailGames) || 0
      },
      sourceKeyCounts: {
        core: Object.keys(coreMetrics).length,
        derived: Object.keys(derivedMetrics).length,
        insights: Object.keys(metricSources.insights || {}).length,
        custom: Object.keys(metricSources.custom || {}).length
      },
      dataSummary: {
        leaderboardCount: leaderboard.length,
        datasetRowCount: Array.isArray(data.dataset) ? data.dataset.length : 0,
        playerRowCount: rows.length,
        leaderboardPreviewCount: leaderboardPreview.length,
        rowPreviewCount: rowPreview.length
      },
      leaderboardPreview,
      rowPreview
    };
  }

  function resolveBadgesFromManifest(manifest, context, player, opts = {}) {
    if (!context || !player) return [];
    const includeLocked = !!opts.includeLocked;
    const requestedLimit = Number(opts.maxBadges);
    const defaultLimit = Number(opts.defaultLimit);
    const maxBadges = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.floor(requestedLimit))
      : Number.isFinite(defaultLimit)
        ? Math.max(1, Math.floor(defaultLimit))
        : 1;
    const badgeContext = buildBadgeContext(context, player, opts);
    return evaluateBadges(manifest, badgeContext, {
      includeLocked,
      maxBadges
    });
  }

  function resolvePlayerCardBadges(context, player, opts = {}) {
    return resolveBadgesFromManifest(PLAYER_CARD_BADGE_MANIFEST, context, player, {
      ...opts,
      includeLocked: opts.includeLocked !== false,
      defaultLimit: PLAYER_CARD_BADGE_MANIFEST.length
    });
  }

  function normalizeBadgeDomId(value) {
    return (
      String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'badge'
    );
  }

  function buildSinglePlayerBadgeMarkup(badge, index) {
    if (!badge) return '';
    const earned = badge.earned !== false;
    const hasTitle = !!badge.text;
    const hasProgress = !!badge.progress;
    const hasRequirement = !!badge.requirement;
    const hasDescription = !!badge.description;
    const hasIcon = earned && !!badge.icon;
    const hasImage = earned && !!badge.image;
    const hasDetails = hasTitle || hasProgress || hasRequirement || hasDescription;
    if (!hasTitle && !hasIcon && !hasImage && !hasProgress) return '';

    const contentParts = [];
    if (hasImage) {
      const alt = badge.alt || badge.text || 'Player badge';
      contentParts.push(`<img class="playerCard__badgeImage" src="${escapeHtml(badge.image)}" alt="${escapeHtml(alt)}" />`);
    } else if (hasIcon) {
      contentParts.push(`<div class="playerCard__badgeIcon" aria-hidden="true">${badge.icon}</div>`);
    } else {
      contentParts.push(`<div class="playerCard__badgeLock" aria-hidden="true">${badge.icon}</div>`);
    }

    const label = badge.ariaLabel || [badge.text, badge.progress, badge.requirement].filter(Boolean).join('. ');
    const tooltip = [badge.text, badge.progress, badge.requirement, badge.description].filter(Boolean).join(' - ');
    const titleAttr = tooltip ? ` title="${escapeHtml(tooltip)}"` : '';
    const ariaAttr = label ? ` aria-label="${escapeHtml(label)}"` : '';
    const dataAttr = badge.id ? ` data-badge-id="${escapeHtml(badge.id)}"` : '';
    const stateAttr = ` data-badge-earned="${earned ? 'true' : 'false'}"`;
    const stateClass = earned ? ' playerCard__badge--earned' : ' playerCard__badge--locked';
    const expandableClass = hasDetails ? ' playerCard__badge--expandable' : '';
    const controlsId = hasDetails ? `playerBadgeDesc-${normalizeBadgeDomId(badge.id || `item-${index}`)}-${index}` : '';
    const interactionAttrs = hasDetails
      ? ` role="button" tabindex="0" data-player-badge="true" aria-expanded="false" aria-controls="${controlsId}"`
      : '';
    const closeControlMarkup = hasDetails
      ? '<button type="button" class="playerCard__badgeClose" data-player-badge-close="true" aria-label="Collapse badge details">✖</button>'
      : '';
    const detailsMarkup = hasDetails
      ? `
        <div class="playerCard__badgeDetails" id="${controlsId}">
          ${hasTitle ? `<div class="playerCard__badgeTitle">${escapeHtml(badge.text)}</div>` : ''}
          ${hasProgress ? `<div class="playerCard__badgeDetailRow"><span>Current</span><strong>${escapeHtml(badge.progress)}</strong></div>` : ''}
          ${hasRequirement ? `<div class="playerCard__badgeDetailRow"><span>Requirement</span><strong>${escapeHtml(badge.requirement)}</strong></div>` : ''}
          ${hasDescription ? `<div class="playerCard__badgeDescription">${escapeHtml(badge.description)}</div>` : ''}
        </div>
      `
      : '';
    return `
      <div class="playerCard__badge${stateClass}${expandableClass}"${interactionAttrs}${titleAttr}${ariaAttr}${dataAttr}${stateAttr}>
        <div class="playerCard__badgeContent">
          <div class="playerCard__badgeTop">
            ${contentParts.join('')}
            ${closeControlMarkup}
          </div>
        </div>
        ${detailsMarkup}
      </div>
    `;
  }

  function buildPlayerBadgesMarkup(badges, opts = {}) {
    if (!Array.isArray(badges) || !badges.length) return '';
    const requestedLimit = Number(opts.maxBadges);
    const maxBadges = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.floor(requestedLimit))
      : PLAYER_CARD_BADGE_MANIFEST.length;
    const limitedBadges = badges
      .filter(Boolean)
      .slice(0, maxBadges)
    const earnedBadges = limitedBadges.filter((badge) => badge.earned !== false);
    const lockedBadges = limitedBadges.filter((badge) => badge.earned === false);

    const buildGroupMarkup = (label, groupBadges, startIndex) => {
      if (!groupBadges.length) return '';
      const itemsMarkup = groupBadges
        .map((badge, index) => buildSinglePlayerBadgeMarkup(badge, startIndex + index))
        .join('');
      return `
        <section class="playerCard__badgeGroup" aria-label="${escapeHtml(label)}">
          <div class="playerCard__badgeGroupTitle">${escapeHtml(label)}</div>
          <div class="playerCard__badgeGrid">
            ${itemsMarkup}
          </div>
        </section>
      `;
    };

    return [
      buildGroupMarkup('🟩 Earned Badges', earnedBadges, 0),
      buildGroupMarkup('⬛ Locked Badges', lockedBadges, earnedBadges.length)
    ].join('');
  }

  global.BadgeSystem = {
    PLAYER_CARD_BADGE_MANIFEST,
    createCrownContext,
    createBadgeMetricRegistry,
    createEmptyPlayerMetrics,
    updatePlayerMetricsFromRow,
    buildPlayerMetricsMap,
    buildLeaderboardRankings,
    getPlayerMetrics,
    buildBadgeContext,
    summarizeBadgeContextForDebug,
    resolvePlayerCardBadges,
    buildPlayerBadgesMarkup
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.BadgeSystem;
  }
})(typeof window !== 'undefined' ? window : globalThis);
