(function (global) {
  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
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
    const keys = ['1','2','3','4','5','6','X'];
    const trackRows = !opts || opts.trackRows !== false;
    return {
      player,
      totalGames: 0,
      solvedGames: 0,
      failGames: 0,
      crownWins: 0,
      susWins: 0,
      winRatio: 0,
      buckets: Object.fromEntries(keys.map(k => [k, 0])),
      crownBuckets: Object.fromEntries(keys.map(k => [k, 0])),
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
    const bucketKey = (solved && row.guesses) ? String(row.guesses) : 'X';
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

  const BADGE_HELPERS = {
    ordinal: getOrdinal,
    ratioPercent: (wins, total) => {
      if (!total) return '0%';
      return `${((wins / total) * 100).toFixed(0)}%`;
    }
  };

  const PLAYER_BADGE_MANIFEST = [
    {
      id: 'crown_leaderboard_first_place',
      icon: '👑',
      title: '1st Place',
      description: (ctx) => `${ctx.player} leads with ${ctx.leaderboardEntry.winCount} crowns.`,
      predicate: (ctx) => !!ctx.leaderboardEntry && ctx.leaderboardEntry.place === 1
    },
    {
      id: 'has_sus_wins',
      icon: '👀',
      title: 'Sus Wins',
      description: (ctx) => `${ctx.player} logged ${ctx.metrics.susWins} one-guess solves.`,
      predicate: (ctx) => !!(ctx.metrics && ctx.metrics.susWins > 1)
    },
    {
      id: 'crown_leaderboard_top_ten',
      icon: '🏅',
      title: (ctx) => `${getOrdinal(ctx.leaderboardEntry.place)} Place`,
      description: (ctx) => `${ctx.player} is top 10 with ${ctx.leaderboardEntry.winCount} wins.`,
      predicate: (ctx) => !!ctx.leaderboardEntry && ctx.leaderboardEntry.place > 1 && ctx.leaderboardEntry.place <= 10
    },
    {
      id: 'crown_guardian',
      icon: '🛡',
      title: 'Crown Guardian',
      description: (ctx) => `${ctx.player} kept crowns coming for ${ctx.metrics.crownWins} days.`,
      predicate: (ctx) => ctx.metrics.crownWins > 7
    },
    {
      id: 'win_under_20',
      icon: '😣',
      title: 'Finding Footing',
      description: (ctx) => `${ctx.player} is still chasing crowns (${ctx.metrics.crownWins} so far).`,
      predicate: (ctx) => !!(ctx.metrics && ctx.metrics.crownWins < 20)
    },
    {
      id: 'low_games_played',
      icon: '😴',
      title: 'Power Nap',
      description: (ctx) => `${ctx.player} has only played ${ctx.metrics.totalGames} games in this window.`,
      predicate: (ctx) => !!(ctx.metrics && ctx.dataset && ctx.metrics.totalGames < Math.max(3, Math.round(ctx.dataset.length * 0.05)))
    }
  ];

  const PLAYER_BADGE_RULES = PLAYER_BADGE_MANIFEST;

  function buildBadgePayload(entry, ctx) {
    const title = typeof entry.title === 'function' ? entry.title(ctx, BADGE_HELPERS) : entry.title;
    const description = typeof entry.description === 'function' ? entry.description(ctx, BADGE_HELPERS) : entry.description;
    const icon = typeof entry.icon === 'function' ? entry.icon(ctx, BADGE_HELPERS) : entry.icon;
    const image = typeof entry.image === 'function' ? entry.image(ctx, BADGE_HELPERS) : entry.image;
    if (!title && !icon && !image) return null;
    return {
      id: entry.id,
      icon,
      image,
      text: title,
      description
    };
  }

  function evaluateBadges(manifest, ctx, limit = 1) {
    const maxBadges = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1;
    const matches = [];
    for (const entry of manifest) {
      if (!entry || typeof entry.predicate !== 'function') continue;
      try {
        if (entry.predicate(ctx, BADGE_HELPERS)) {
          const payload = buildBadgePayload(entry, ctx);
          if (!payload) continue;
          matches.push(payload);
          if (matches.length >= maxBadges) break;
        }
      } catch (err) {
        console.warn('Badge predicate failed', entry.id, err);
      }
    }
    return matches;
  }


  function resolvePlayerBadges(context, player, opts = {}) {
    if (!context || !player) return [];
    const requestedLimit = Number(opts.maxBadges);
    const maxBadges = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.floor(requestedLimit))
      : 4;
    const leaderboard = Array.isArray(context.leaderboard) ? context.leaderboard : [];
    const dataset = Array.isArray(context.dataset) ? context.dataset : [];
    const metricsMap = context && context.playerMetrics instanceof Map
      ? context.playerMetrics
      : buildPlayerMetricsMap(dataset);
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
    const badgeContext = {
      player,
      leaderboard,
      dataset,
      leaderboardEntry,
      metrics,
      rows,
      metricsMap,
      helpers: BADGE_HELPERS
    };
    return evaluateBadges(PLAYER_BADGE_MANIFEST, badgeContext, maxBadges);
  }

  function resolvePlayerBadge(context, player) {
    const badges = resolvePlayerBadges(context, player, { maxBadges: 1 });
    return badges.length ? badges[0] : null;
  }

  function normalizeBadgeDomId(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'badge';
  }

  function buildSinglePlayerBadgeMarkup(badge, index) {
    if (!badge) return '';
    const parts = [];
    const hasIcon = !!badge.icon;
    const hasImage = !!badge.image;
    if (badge.icon) {
      parts.push(`<div class="playerCard__badgeIcon" aria-hidden="true">${badge.icon}</div>`);
    }
    if (badge.image) {
      const alt = badge.alt || badge.text || 'Player badge';
      parts.push(`<img class="playerCard__badgeImage" src="${escapeHtml(badge.image)}" alt="${escapeHtml(alt)}" />`);
    }
    if (!hasIcon && !hasImage && badge.text) {
      parts.push(`<div class="playerCard__badgeText playerCard__badgeText--fallback">${escapeHtml(badge.text)}</div>`);
    }
    if (!parts.length) return '';
    const hasTitle = !!badge.text;
    const hasDescription = !!badge.description;
    const hasDetails = hasTitle || hasDescription;
    const label = badge.ariaLabel || [badge.text, badge.description].filter(Boolean).join('. ');
    const tooltip = hasDescription
      ? (hasTitle ? `${badge.text}: ${badge.description}` : badge.description)
      : (badge.text || '');
    const titleAttr = tooltip ? ` title="${escapeHtml(tooltip)}"` : '';
    const ariaAttr = label ? ` aria-label="${escapeHtml(label)}"` : '';
    const dataAttr = badge.id ? ` data-badge-id="${escapeHtml(badge.id)}"` : '';
    const expandableClass = hasDetails ? ' playerCard__badge--expandable' : '';
    const controlsId = hasDetails
      ? `playerBadgeDesc-${normalizeBadgeDomId(badge.id || `item-${index}`)}-${index}`
      : '';
    const interactionAttrs = hasDetails
      ? ` role="button" tabindex="0" data-player-badge="true" aria-expanded="false" aria-controls="${controlsId}"`
      : '';
    const detailsMarkup = hasDetails
      ? `
        <div class="playerCard__badgeDetails" id="${controlsId}">
          ${hasTitle ? `<div class="playerCard__badgeTitle">${escapeHtml(badge.text)}</div>` : ''}
          ${hasDescription ? `<div class="playerCard__badgeDescription">${escapeHtml(badge.description)}</div>` : ''}
        </div>
      `
      : '';
    return `
      <div class="playerCard__badge${expandableClass}"${interactionAttrs}${titleAttr}${ariaAttr}${dataAttr}>
        <div class="playerCard__badgeContent">${parts.join('')}</div>
        ${detailsMarkup}
      </div>
    `;
  }

  function buildPlayerBadgesMarkup(badges, opts = {}) {
    if (!Array.isArray(badges) || !badges.length) return '';
    const requestedLimit = Number(opts.maxBadges);
    const maxBadges = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.floor(requestedLimit))
      : 4;
    return badges
      .filter(Boolean)
      .slice(0, maxBadges)
      .map((badge, index) => buildSinglePlayerBadgeMarkup(badge, index))
      .join('');
  }

  function buildPlayerBadgeMarkup(badge) {
    return buildPlayerBadgesMarkup(badge ? [badge] : [], { maxBadges: 1 });
  }

  global.BadgeSystem = {
    PLAYER_BADGE_MANIFEST,
    PLAYER_BADGE_RULES,
    createCrownContext,
    createEmptyPlayerMetrics,
    updatePlayerMetricsFromRow,
    buildPlayerMetricsMap,
    buildLeaderboardRankings,
    getPlayerMetrics,
    resolvePlayerBadges,
    resolvePlayerBadge,
    buildPlayerBadgesMarkup,
    buildPlayerBadgeMarkup
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.BadgeSystem;
  }
})(typeof window !== 'undefined' ? window : globalThis);





