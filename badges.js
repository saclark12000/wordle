(function (global) {
  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function createKingContext() {
    return {
      leaderboard: [],
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
      kingWins: 0,
      susWins: 0,
      winRatio: 0,
      buckets: Object.fromEntries(keys.map(k => [k, 0])),
      kingBuckets: Object.fromEntries(keys.map(k => [k, 0])),
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
      metrics.kingWins += 1;
      if (metrics.kingBuckets[bucketKey] !== undefined) {
        metrics.kingBuckets[bucketKey] += 1;
      }
    }
    metrics.winRatio = metrics.totalGames ? Math.round(metrics.kingWins / metrics.totalGames) : 0;
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

  const PLAYER_BADGE_RULES = [
    {
      id: 'king_leaderboard_first_place',
      matches: (ctx) => !!ctx.leaderboardEntry && ctx.leaderboardEntry.place === 1,
      build: (ctx) => ({
        icon: '👑',
        text: '1st Place',
        description: `${ctx.player} currently leads the King wins leaderboard with ${ctx.leaderboardEntry.winCount} wins.`
      })
    },
    {
      id: 'has_sus_wins',
      matches: (ctx) => !!(ctx.metrics && ctx.metrics.susWins > 1),
      build: (ctx) => ({
        icon: '👀',
        text: 'Sus Wins',
        description: `${ctx.player} has ${ctx.metrics.susWins} sus wins (1/6 solves).`
      })
    },
    {
      id: 'low_games_played',
      matches: (ctx) => {
        return !!(ctx.metrics && ctx.metrics.totalGames < Math.round(.05* ctx.dataset.length))
      },
      build: (ctx) => ({
        icon: '😴',
        text: 'ZzzZz',
        description: `${ctx.player} has only played ${ctx.metrics.totalGames} games.`
      })
    },
    {
      id: 'king_leaderboard_top_ten',
      matches: (ctx) => !!ctx.leaderboardEntry && ctx.leaderboardEntry.place < 11,
      build: (ctx) => ({
        icon: '🏅',
        text: `${getOrdinal(ctx.leaderboardEntry.place)} Place`,
        description: `${ctx.player} currently leads the King wins leaderboard with ${ctx.leaderboardEntry.winCount} wins.`
      })
    },
    {
      id: 'win_under_20',
      matches: (ctx) => !!(ctx.metrics && ctx.metrics.kingWins < 20),
      build: (ctx) => ({
        icon: '😥',
        text: 'Cant Wins',
        description: `${ctx.player} has ${ctx.metrics.kingWins} wins rate.`
      })
    }
  ];

  function resolvePlayerBadge(context, player) {
    if (!context || !player) return null;
    const leaderboard = Array.isArray(context.leaderboard) ? context.leaderboard : [];
    const dataset = Array.isArray(context.dataset) ? context.dataset : [];
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
      metricsMap: context.playerMetrics
    };
    for (const rule of PLAYER_BADGE_RULES) {
      if (!rule || typeof rule.matches !== 'function') continue;
      if (rule.matches(badgeContext)) {
        const built = typeof rule.build === 'function' ? rule.build(badgeContext) : null;
        if (built && (built.icon || built.image || built.text)) {
          return { id: rule.id, ...built };
        }
      }
    }
    return null;
  }

  function buildPlayerBadgeMarkup(badge) {
    if (!badge) return '';
    const parts = [];
    if (badge.icon) {
      parts.push(`<div class="playerCard__badgeIcon" aria-hidden="true">${badge.icon}</div>`);
    }
    if (badge.image) {
      const alt = badge.alt || badge.text || 'Player badge';
      parts.push(`<img class="playerCard__badgeImage" src="${escapeHtml(badge.image)}" alt="${escapeHtml(alt)}" />`);
    }
    if (badge.text) {
      parts.push(`<div class="playerCard__badgeText">${escapeHtml(badge.text)}</div>`);
    }
    if (!parts.length) return '';
    const label = badge.ariaLabel || badge.description || badge.text || '';
    const titleAttr = badge.description ? ` title="${escapeHtml(badge.description)}"` : '';
    const ariaAttr = label ? ` aria-label="${escapeHtml(label)}"` : '';
    const dataAttr = badge.id ? ` data-badge-id="${escapeHtml(badge.id)}"` : '';
    const description = badge.description ? `<div class="playerCard__badgeDescription">${escapeHtml(badge.description)}</div>` : '';
    const expandableClass = description ? ' playerCard__badge--expandable' : '';
    return `
      <div class="playerCard__badge${expandableClass}" role="button" tabindex="0" data-player-badge="true" aria-expanded="false"${titleAttr}${ariaAttr}${dataAttr}>
        <div class="playerCard__badgeContent">${parts.join('')}</div>
        ${description}
      </div>
    `;
  }

  global.BadgeSystem = {
    PLAYER_BADGE_RULES,
    createKingContext,
    createEmptyPlayerMetrics,
    updatePlayerMetricsFromRow,
    buildPlayerMetricsMap,
    getPlayerMetrics,
    resolvePlayerBadge,
    buildPlayerBadgeMarkup
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.BadgeSystem;
  }
})(typeof window !== 'undefined' ? window : globalThis);
