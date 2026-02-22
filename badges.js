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
      playerMetrics: new Map()
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
    const windowDays = Number(ctx && ctx.windowDays) || 0;
    if (windowDays > 0) {
      return Math.max(8, Math.round(windowDays * 0.6));
    }
    return 10;
  }

  function getCrownRatio(metrics) {
    if (!metrics || !metrics.totalGames) return 0;
    return metrics.crownWins / metrics.totalGames;
  }

  function getInsights(ctx) {
    return ctx && ctx.insights ? ctx.insights : {};
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
    }
  };

  const PLAYER_CARD_BADGE_MANIFEST = [
    {
      id: 'top_ten_rank',
      icon: () => iconFromCodePoint(0x1f3c5),
      title: (ctx) => (ctx.playerRank ? `${getOrdinal(ctx.playerRank)} Place` : 'Top 10 Rank'),
      description: (ctx) => `${ctx.player} has ${ctx.metrics.crownWins} crowns this window.`,
      requirement: 'Finish in the top 10 for crown wins in this window.',
      progress: (ctx) => {
        if (!ctx.playerRank) return 'Current rank: --';
        return `Current rank: ${getOrdinal(ctx.playerRank)} (${ctx.metrics.crownWins} crowns)`;
      },
      predicate: (ctx) => Number(ctx.playerRank) > 0 && Number(ctx.playerRank) <= 10
    },
    {
      id: 'sus_wins',
      icon: () => iconFromCodePoint(0x1f440),
      title: 'Sus Wins',
      description: (ctx) => `${ctx.player} one-guess solves in this window.`,
      requirement: 'Get at least 1 one-guess solve.',
      progress: (ctx) => `${ctx.metrics.susWins} / 1 one-guess solves`,
      predicate: (ctx) => Number(ctx.metrics.susWins) >= 1
    },
    {
      id: 'games_played',
      icon: () => iconFromCodePoint(0x1f4c5),
      title: 'Games Played',
      description: (ctx) => `${ctx.player} participation volume in this window.`,
      requirement: (ctx) => `Play at least ${getGamesPlayedTarget(ctx)} games.`,
      progress: (ctx) => `${ctx.metrics.totalGames} / ${getGamesPlayedTarget(ctx)} games`,
      predicate: (ctx) => Number(ctx.metrics.totalGames) >= getGamesPlayedTarget(ctx)
    },
    {
      id: 'crown_conversion',
      icon: () => iconFromCodePoint(0x1f451),
      title: 'Crown Conversion',
      description: (ctx) => `${ctx.player} crown-win percentage this window.`,
      requirement: 'Reach at least 30% crown conversion.',
      progress: (ctx) => `${formatPercent(getCrownRatio(ctx.metrics), 1)} / 30%`,
      predicate: (ctx) => getCrownRatio(ctx.metrics) >= 0.3
    },
    {
      id: 'active_streak',
      icon: () => iconFromCodePoint(0x1f525),
      title: 'Active Crown Streak',
      description: (ctx) => `${ctx.player}'s current active crown streak.`,
      requirement: 'Hold an active crown streak of at least 3 days.',
      progress: (ctx) => `${Number(getInsights(ctx).activeCrownStreak) || 0} / 3 days`,
      predicate: (ctx) => Number(getInsights(ctx).activeCrownStreak) >= 3
    },
    {
      id: 'best_streak',
      icon: () => iconFromCodePoint(0x1f6e1),
      title: 'Best Crown Streak',
      description: (ctx) => `${ctx.player}'s best crown streak in this window.`,
      requirement: 'Reach a best streak of at least 5 days.',
      progress: (ctx) => `${Number(getInsights(ctx).bestCrownStreak) || 0} / 5 days`,
      predicate: (ctx) => Number(getInsights(ctx).bestCrownStreak) >= 5
    },
    {
      id: 'efficient_crowns',
      icon: () => iconFromCodePoint(0x1f3af),
      title: 'Crown Efficiency',
      description: (ctx) => `${ctx.player}'s average guesses on crowned wins.`,
      requirement: 'Keep average guesses when crowned at 3.5 or lower.',
      progress: (ctx) => {
        const raw = getInsights(ctx).avgGuessWhenCrowned;
        const avg = Number(raw);
        if (raw === null || raw === undefined || raw === '') return 'No crowned solves yet';
        if (!Number.isFinite(avg)) return 'No crowned solves yet';
        return `Current avg: ${avg.toFixed(1)} guesses`;
      },
      predicate: (ctx) => {
        const raw = getInsights(ctx).avgGuessWhenCrowned;
        const avg = Number(raw);
        if (raw === null || raw === undefined || raw === '') return false;
        return Number.isFinite(avg) && avg <= 3.5;
      }
    },
    {
      id: 'participation_rate',
      icon: () => iconFromCodePoint(0x1f4ca),
      title: 'Participation Rate',
      description: (ctx) => `${ctx.player}'s participation across the active window.`,
      requirement: 'Participate in at least 80% of days in this window.',
      progress: (ctx) => `${formatPercent(Number(getInsights(ctx).participationRate) || 0, 0)} / 80%`,
      predicate: (ctx) => Number(getInsights(ctx).participationRate) >= 0.8
    },
    {
      id: 'badge_collector',
      icon: '🎁',
      title: 'Badge Collector',
      requirement: 'Earn at least 5 badges in this window.',
      progress: (ctx, helpers) => `${helpers.metricNumber(ctx.badgeState && ctx.badgeState.earnedBadgeCount)} / 5 badges earned`,
      predicate: (ctx) => Number(ctx.badgeState && ctx.badgeState.earnedBadgeCount) >= 5
    }
  ];

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

  function buildBadgeContext(context, player, opts = {}) {
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
    const insights = opts.insights || (context && context.insights) || null;
    const windowDays = Number(opts.windowDays || (context && context.windowDays)) || 0;
    return {
      player,
      leaderboard,
      dataset,
      leaderboardEntry,
      metrics,
      rows,
      metricsMap,
      insights,
      windowDays,
      playerRank: getPlayerRank(metricsMap, player),
      badgeState: {
        earnedBadgeIds: [],
        earnedBadgeCount: 0
      },
      helpers: BADGE_HELPERS
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
      contentParts.push('<div class="playerCard__badgeLock" aria-hidden="true"></div>');
    }
    if (hasTitle) {
      contentParts.push(`<div class="playerCard__badgeText">${escapeHtml(badge.text)}</div>`);
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
          <div class="playerCard__badgeTop">${contentParts.join('')}</div>
          ${hasProgress ? `<div class="playerCard__badgeMetric">${escapeHtml(badge.progress)}</div>` : ''}
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
    return badges
      .filter(Boolean)
      .slice(0, maxBadges)
      .map((badge, index) => buildSinglePlayerBadgeMarkup(badge, index))
      .join('');
  }

  global.BadgeSystem = {
    PLAYER_CARD_BADGE_MANIFEST,
    createCrownContext,
    createEmptyPlayerMetrics,
    updatePlayerMetricsFromRow,
    buildPlayerMetricsMap,
    buildLeaderboardRankings,
    getPlayerMetrics,
    resolvePlayerCardBadges,
    buildPlayerBadgesMarkup
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.BadgeSystem;
  }
})(typeof window !== 'undefined' ? window : globalThis);
