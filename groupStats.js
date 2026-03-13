(function (global) {
  const DEFAULT_GROUP_STATS_LEADERBOARD_ID = 'crownWins';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const TOP_RANK_BAR_CLASS = 'groupStatsPanel__barFill--gold';
  const DEFAULT_BAR_CLASS = 'groupStatsPanel__barFill--blue';

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
  }

  function formatRatioPercent(value, digits) {
    if (!Number.isFinite(value)) return `0.${'0'.repeat(Math.max(0, digits || 0))}%`;
    return `${value.toFixed(digits)}%`;
  }

  function getRankMedal(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
  }

  function getRankColor(rank) {
    if (rank === 1) return '#f5c842';
    if (rank === 2) return '#b0b8c8';
    if (rank === 3) return '#cd7f3a';
    return 'rgba(230,232,235,.45)';
  }

  function getDayKey(row, fallbackIndex) {
    if (row && row.dayKey) return String(row.dayKey);
    if (row && row.dayIndex !== undefined && row.dayIndex !== null) {
      return `day-${row.dayIndex}`;
    }
    return `day-${fallbackIndex}`;
  }

  function getDayTimestamp(row, fallbackIndex) {
    const timestamp = Number(row && row.dayTimestamp);
    if (Number.isFinite(timestamp)) return timestamp;
    const dayIndex = Number(row && row.dayIndex);
    if (Number.isFinite(dayIndex)) return dayIndex;
    return fallbackIndex;
  }

  function getDayLabel(row, fallbackKey) {
    return String((row && row.dayLabel) || fallbackKey || '').trim() || fallbackKey;
  }

  function createPlayerAccumulator(name) {
    return {
      name,
      crownWins: 0,
      totalGames: 0,
      fails: 0,
      soloCrowns: 0,
      crownGuessSum: 0,
      daysPlayed: new Set(),
      crownDayEntries: []
    };
  }

  function computeBestStreak(crownDayEntries) {
    const orderedDays = [...new Map(
      (Array.isArray(crownDayEntries) ? crownDayEntries : [])
        .filter(Boolean)
        .map((entry) => [entry.key, entry])
    ).values()].sort((a, b) => a.timestamp - b.timestamp);

    if (!orderedDays.length) return 0;

    let bestStreak = 0;
    let activeStreak = 0;
    let previous = null;

    orderedDays.forEach((entry) => {
      const isSequential = previous
        ? Math.abs(entry.timestamp - previous.timestamp) <= DAY_MS * 1.5
        : false;
      activeStreak = previous && isSequential ? activeStreak + 1 : 1;
      bestStreak = Math.max(bestStreak, activeStreak);
      previous = entry;
    });

    return bestStreak;
  }

  const GROUP_STATS_LEADERBOARDS = [
    {
      id: 'crownWins',
      label: '👑 Crown Wins',
      shortLabel: 'Crown Wins',
      description: 'Total crown wins per player',
      getValue: (player) => player.crownWins,
      format: (value) => `${value} win${value === 1 ? '' : 's'}`,
      sortDir: 'desc'
    },
    {
      id: 'crownPct',
      label: '👑 Win %',
      shortLabel: 'Win Rate',
      description: 'Crown wins as a % of games played (min. 10 games)',
      getValue: (player) => player.crownPct,
      format: (value) => `${value.toFixed(1)}%`,
      sortDir: 'desc',
      filter: (player) => player.totalGames >= 10,
      filterNote: 'min. 10 games played'
    },
    {
      id: 'participation',
      label: '📆 Participation',
      shortLabel: 'Participation',
      description: '% of tracked days the player submitted a score',
      getValue: (player) => player.participation,
      format: (value) => `${value.toFixed(1)}%`,
      sortDir: 'desc'
    },
    {
      id: 'avgGuesses',
      label: '💎 Avg Guesses',
      shortLabel: 'Avg Guesses',
      description: 'Average guesses on crown wins, lower is better (min. 1 crown)',
      getValue: (player) => player.avgGuesses,
      format: (value) => value === null ? 'N/A' : value.toFixed(2),
      sortDir: 'asc',
      filter: (player) => player.crownWins > 0,
      filterNote: 'players with at least 1 crown win'
    },
    {
      id: 'soloCrowns',
      label: '👤 Solo Crowns',
      shortLabel: 'Solo Crowns',
      description: 'Times as the only crown winner that day',
      getValue: (player) => player.soloCrowns,
      format: (value) => `${value}`,
      sortDir: 'desc'
    },
    {
      id: 'fails',
      label: '💀 Fails',
      shortLabel: 'Fails',
      description: 'Total failed games (X/6)',
      getValue: (player) => player.fails,
      format: (value) => `${value}`,
      sortDir: 'desc'
    },
    {
      id: 'streak',
      label: '🍆 Best Streak',
      shortLabel: 'Best Streak',
      description: 'Longest consecutive crown win streak in tracked days',
      getValue: (player) => player.streak,
      format: (value) => `${value} day${value === 1 ? '' : 's'}`,
      sortDir: 'desc'
    }
  ];

  function getGroupStatsLeaderboardConfig(leaderboardId) {
    return GROUP_STATS_LEADERBOARDS.find((entry) => entry.id === leaderboardId) || GROUP_STATS_LEADERBOARDS[0];
  }

  function isGroupStatsLeaderboardId(leaderboardId) {
    return GROUP_STATS_LEADERBOARDS.some((entry) => entry.id === leaderboardId);
  }

  function deriveGroupStatsData(rows) {
    const dataset = Array.isArray(rows) ? rows : [];
    const playerMap = new Map();
    const dayMap = new Map();
    const crownWinnersByDay = new Map();

    dataset.forEach((row, index) => {
      if (!row || !row.player) return;

      const dayKey = getDayKey(row, index + 1);
      const dayEntry = {
        key: dayKey,
        label: getDayLabel(row, dayKey),
        timestamp: getDayTimestamp(row, index + 1)
      };
      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, dayEntry);
      }

      let player = playerMap.get(row.player);
      if (!player) {
        player = createPlayerAccumulator(row.player);
        playerMap.set(row.player, player);
      }

      player.totalGames += 1;
      player.daysPlayed.add(dayKey);

      if (!row.solved) {
        player.fails += 1;
      }

      if (row.isCrown) {
        player.crownWins += 1;
        if (Number.isFinite(Number(row.guesses))) {
          player.crownGuessSum += Number(row.guesses);
        }
        player.crownDayEntries.push(dayEntry);
        if (!crownWinnersByDay.has(dayKey)) {
          crownWinnersByDay.set(dayKey, new Set());
        }
        crownWinnersByDay.get(dayKey).add(row.player);
      }
    });

    crownWinnersByDay.forEach((winners) => {
      if (winners.size !== 1) return;
      const [winner] = winners;
      const player = playerMap.get(winner);
      if (player) {
        player.soloCrowns += 1;
      }
    });

    const dayEntries = [...dayMap.values()].sort((a, b) => a.timestamp - b.timestamp);
    const totalDays = dayEntries.length;
    const latestDate = dayEntries.length ? dayEntries[dayEntries.length - 1].label : '';

    const players = [...playerMap.values()]
      .map((player) => ({
        name: player.name,
        crownWins: player.crownWins,
        totalGames: player.totalGames,
        crownPct: player.totalGames ? (player.crownWins / player.totalGames) * 100 : 0,
        participation: totalDays ? (player.daysPlayed.size / totalDays) * 100 : 0,
        avgGuesses: player.crownWins ? player.crownGuessSum / player.crownWins : null,
        fails: player.fails,
        soloCrowns: player.soloCrowns,
        streak: computeBestStreak(player.crownDayEntries)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const totalGames = players.reduce((sum, player) => sum + player.totalGames, 0);
    const totalCrowns = players.reduce((sum, player) => sum + player.crownWins, 0);
    const totalCrownRatio = totalGames ? totalCrowns / totalGames : 0;

    return {
      players,
      totalDays,
      totalGames,
      totalCrowns,
      totalCrownRatio,
      crownPct: (totalCrownRatio * 100).toFixed(1),
      latestDate
    };
  }

  function deriveGroupStatsCallouts(data) {
    if (!data || !Array.isArray(data.players) || !data.players.length) return [];

    const callouts = [];
    const newcomerPlayers = data.players.filter((player) => player.totalGames <= 3 && player.crownWins > 0);
    if (newcomerPlayers.length >= Math.max(2, Math.ceil(data.players.length * 0.2))) {
      callouts.push({
        title: 'Newcomer surge',
        detail: `${newcomerPlayers.length} newer players earned crowns this window.`,
        meta: newcomerPlayers.slice(0, 3).map((player) => player.name).join(', ')
      });
    }

    if (data.totalCrowns > 0) {
      const crownWins = getGroupStatsLeaderboardEntries(data, 'crownWins').rows;
      const leader = crownWins[0];
      const leaderWins = leader ? leader.metricValue : 0;
      const share = leaderWins ? leaderWins / data.totalCrowns : 0;
      if (share >= 0.35 && leader) {
        callouts.push({
          title: 'Crown concentration',
          detail: `${leader.player.name} owns ${formatRatioPercent(share * 100, 0)} of crowns (${leaderWins}/${data.totalCrowns}).`
        });
      }
    }

    if (data.totalCrownRatio >= 0.6) {
      callouts.push({
        title: 'Consistent crowd',
        detail: `Group crown conversion is ${formatRatioPercent(data.totalCrownRatio * 100, 0)} this window.`
      });
    }

    return callouts;
  }

  function getGroupStatsLeaderboardEntries(data, leaderboardId) {
    const leaderboard = getGroupStatsLeaderboardConfig(leaderboardId);
    let players = leaderboard.filter ? data.players.filter(leaderboard.filter) : data.players.slice();

    if (leaderboard.sortDir === 'asc') {
      players = players.filter((player) => leaderboard.getValue(player) !== null);
    }

    players.sort((a, b) => {
      const aValue = leaderboard.getValue(a);
      const bValue = leaderboard.getValue(b);
      if (aValue === bValue) {
        return a.name.localeCompare(b.name);
      }
      return leaderboard.sortDir === 'desc' ? bValue - aValue : aValue - bValue;
    });

    const maxValue = leaderboard.sortDir === 'asc' && players.length
      ? leaderboard.getValue(players[players.length - 1])
      : players.length ? leaderboard.getValue(players[0]) : 0;
    const minValue = leaderboard.sortDir === 'asc' && players.length
      ? leaderboard.getValue(players[0])
      : 0;

    return {
      leaderboard,
      rows: players.map((player, index) => {
        const rank = index + 1;
        const metricValue = leaderboard.getValue(player);
        let barPct = 0;

        if (leaderboard.sortDir === 'desc') {
          barPct = maxValue > 0 ? (metricValue / maxValue) * 100 : 0;
        } else {
          const range = maxValue - minValue || 1;
          barPct = ((maxValue - metricValue) / range) * 100;
        }

        return {
          rank,
          medal: getRankMedal(rank),
          rankColor: getRankColor(rank),
          metricValue,
          formattedValue: leaderboard.format(metricValue),
          barPct: clamp(barPct, 0, 100),
          barClass: rank <= 3 ? TOP_RANK_BAR_CLASS : DEFAULT_BAR_CLASS,
          player
        };
      })
    };
  }

  function buildGroupStatsCalloutsMarkup(callouts) {
    if (!Array.isArray(callouts) || !callouts.length) return '';
    return `
      <div class="groupCallouts">
        ${callouts.map((entry) => `
          <div class="groupCallouts__item">
            <div class="groupCallouts__title">${escapeHtml(entry.title || '')}</div>
            <div class="groupCallouts__detail">${escapeHtml(entry.detail || '')}</div>
            ${entry.meta ? `<div class="groupCallouts__meta">${escapeHtml(entry.meta)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  function buildGroupStatsSidebarMarkup(activeLeaderboardId) {
    return GROUP_STATS_LEADERBOARDS.map((leaderboard) => `
      <button
        type="button"
        class="groupStatsPanel__sidebarBtn${leaderboard.id === activeLeaderboardId ? ' groupStatsPanel__sidebarBtn--active' : ''}"
        data-group-stats-leaderboard="${escapeHtml(leaderboard.id)}"
        aria-pressed="${leaderboard.id === activeLeaderboardId ? 'true' : 'false'}"
      >
        ${escapeHtml(leaderboard.label)}
      </button>
    `).join('');
  }

  function buildGroupStatsLeaderboardMarkup(data, activeLeaderboardId) {
    const { leaderboard, rows } = getGroupStatsLeaderboardEntries(data, activeLeaderboardId);

    if (!rows.length) {
      return `
        <div class="groupStatsPanel__contentHeader">
          <h3>${escapeHtml(leaderboard.label)}</h3>
          <p>${escapeHtml(leaderboard.description)}</p>
        </div>
        <div class="groupStatsPanel__state">No eligible players for this leaderboard.</div>
      `;
    }

    return `
      <div class="groupStatsPanel__contentHeader">
        <h3>${escapeHtml(leaderboard.label)}</h3>
        <p>
          ${escapeHtml(leaderboard.description)}
          ${leaderboard.filterNote ? `<span class="groupStatsPanel__filterNote">· ${escapeHtml(leaderboard.filterNote)}</span>` : ''}
        </p>
      </div>
      <table class="groupStatsPanel__table">
        <thead>
          <tr>
            <th class="groupStatsPanel__colPlace">Place</th>
            <th>Player</th>
            <th class="groupStatsPanel__colValue">${escapeHtml(leaderboard.shortLabel)}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((entry) => `
            <tr>
              <td class="groupStatsPanel__place">
                ${entry.medal
                  ? `<span class="groupStatsPanel__medal">${entry.medal}</span>`
                  : `<span class="groupStatsPanel__rankNum" style="color:${entry.rankColor}">${entry.rank}</span>`}
              </td>
              <td class="groupStatsPanel__playerCell">
                <div class="groupStatsPanel__playerName">${escapeHtml(entry.player.name)}</div>
                <div class="groupStatsPanel__barTrack">
                  <div class="groupStatsPanel__barFill ${entry.barClass}" style="width:${entry.barPct.toFixed(1)}%"></div>
                </div>
              </td>
              <td class="groupStatsPanel__value${entry.rank === 1 ? ' groupStatsPanel__value--leader' : ''}">${escapeHtml(entry.formattedValue)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${leaderboard.filterNote ? '<p class="groupStatsPanel__footnote">Only players meeting the minimum requirement are shown.</p>' : ''}
    `;
  }

  function buildGroupStatsPanelMarkup(data, options) {
    const safeOptions = options || {};
    const activeLeaderboardId = isGroupStatsLeaderboardId(safeOptions.activeLeaderboardId)
      ? safeOptions.activeLeaderboardId
      : DEFAULT_GROUP_STATS_LEADERBOARD_ID;
    const title = safeOptions.title || 'Group Stats';
    const latestDate = data && data.latestDate ? data.latestDate : 'n/a';
    const callouts = Array.isArray(safeOptions.callouts)
      ? safeOptions.callouts
      : deriveGroupStatsCallouts(data);

    return `
      <div class="groupStatsPanel" data-group-stats-panel="true">
        <div class="groupStatsPanel__header">
          <div>
            <div class="groupStatsPanel__title">${escapeHtml(title)}</div>
            <div class="groupStatsPanel__meta">Last ${data.totalDays} day(s) · Latest: ${escapeHtml(latestDate)}</div>
          </div>
        </div>

        <div class="groupStatsPanel__summaryGrid">
          <div class="groupStatsPanel__summaryCard">
            <div class="groupStatsPanel__summaryLabel">Total Players</div>
            <div class="groupStatsPanel__summaryValue">${data.players.length}</div>
          </div>
          <div class="groupStatsPanel__summaryCard">
            <div class="groupStatsPanel__summaryLabel">Total Games</div>
            <div class="groupStatsPanel__summaryValue">${data.totalGames.toLocaleString()}</div>
          </div>
          <div class="groupStatsPanel__summaryCard">
            <div class="groupStatsPanel__summaryLabel">👑 Crown Wins</div>
            <div class="groupStatsPanel__summaryValue">${data.totalCrowns} <span class="groupStatsPanel__summaryValueMeta">(${data.crownPct}%)</span></div>
          </div>
          <div class="groupStatsPanel__summaryCard">
            <div class="groupStatsPanel__summaryLabel">Days Tracked</div>
            <div class="groupStatsPanel__summaryValue">${data.totalDays}</div>
          </div>
        </div>

        ${buildGroupStatsCalloutsMarkup(callouts)}

        <div class="groupStatsPanel__main">
          <div class="groupStatsPanel__mainHeader"><span>📊 Leaderboards</span></div>
          <div class="groupStatsPanel__mainBody">
            <nav class="groupStatsPanel__sidebar" aria-label="Group stats leaderboards">
              ${buildGroupStatsSidebarMarkup(activeLeaderboardId)}
            </nav>
            <div class="groupStatsPanel__content">
              ${buildGroupStatsLeaderboardMarkup(data, activeLeaderboardId)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const api = {
    DEFAULT_GROUP_STATS_LEADERBOARD_ID,
    GROUP_STATS_LEADERBOARDS,
    deriveGroupStatsData,
    deriveGroupStatsCallouts,
    getGroupStatsLeaderboardConfig,
    getGroupStatsLeaderboardEntries,
    isGroupStatsLeaderboardId,
    buildGroupStatsPanelMarkup
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.GroupStats = api;
})(typeof window !== 'undefined' ? window : globalThis);
