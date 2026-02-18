// -----------------------------
// Utilities
// -----------------------------
const $ = (id) => document.getElementById(id);
const DEFAULT_CSV_PATH = 'resources/game_data/wordleData.csv';
const DEVELOPER_MODE = new URLSearchParams(window.location.search).get('developer') === 'true';
const CrownWinsCore = window.CrownWinsCore || {};
const {
  looksLikeWordleSummary,
  normalizeWordle,
  detectDateField,
  wordleCrownWins,
  getDayValueFromRow
} = CrownWinsCore;

if (!looksLikeWordleSummary || !normalizeWordle || !wordleCrownWins || !getDayValueFromRow) {
  throw new Error('CrownWinsCore module failed to load.');
}

const { createStateStore } = window.CrownState || {};
if (typeof createStateStore !== 'function') {
  throw new Error('State manager module failed to load.');
}

const stateStore = createStateStore();
const UTF8_DECODER = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

function uniq(arr) {
  return [...new Set(arr)];
}

function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return '0%';
  return `${(value * 100).toFixed(digits)}%`;
}

function downloadText(filename, text) {
  const serialized = `\ufeff${text}`;
  const blob = new Blob([serialized], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// -----------------------------
// State
// -----------------------------
let wordleDateField = null;
let crownModeReady = false;
const {
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
} = window.BadgeSystem || {};

if (!createCrownContext || !resolvePlayerBadge) {
  throw new Error('BadgeSystem module failed to load.');
}

let crownContext = createCrownContext();
const autoRenderConfig = { limit: 25, done: false };
stateStore.setLeaderboardLimit(autoRenderConfig.limit);

function updateLastDaysDefault(maxDay) {
  const input = $('lastDays');
  if (!input) return;
  if (maxDay) {
    input.value = maxDay;
  } else {
    input.value = '';
  }
}

function summarizeMetrics(rows) {
  const metrics = createEmptyPlayerMetrics(null, { trackRows: false });
  for (const r of rows || []) {
    updatePlayerMetricsFromRow(metrics, r);
  }
  return metrics;
}

function computeGroupMetrics(rows) {
  return summarizeMetrics(rows);
}

function computePlayerInsights(metrics, opts = {}) {
  const windowDays = Number(opts.windowDays) || 0;
  const rows =
    (Array.isArray(opts.rows) && opts.rows.length ? opts.rows : null) ||
    (metrics && Array.isArray(metrics.rows) ? metrics.rows : []) ||
    [];
  const byDay = new Map();
  rows.forEach((row) => {
    if (!row) return;
    const key = row.dayKey || `day-${row.dayIndex}`;
    const timestamp = Number(row.dayTimestamp) || Number(row.dayIndex) || 0;
    const existing = byDay.get(key);
    if (existing) {
      existing.isCrown = existing.isCrown || !!row.isCrown;
      existing.timestamp = Math.min(existing.timestamp, timestamp);
    } else {
      byDay.set(key, { isCrown: !!row.isCrown, timestamp });
    }
  });
  const timeline = [...byDay.values()].sort((a, b) => a.timestamp - b.timestamp);
  const DAY_MS = 24 * 60 * 60 * 1000;
  let activeStreak = 0;
  let bestStreak = 0;
  let prevTs = null;
  timeline.forEach((day) => {
    if (!day.isCrown) {
      activeStreak = 0;
      prevTs = day.timestamp;
      return;
    }
    const isSequential = prevTs !== null && Math.abs(day.timestamp - prevTs) <= DAY_MS * 1.5;
    activeStreak = isSequential ? activeStreak + 1 : 1;
    bestStreak = Math.max(bestStreak, activeStreak);
    prevTs = day.timestamp;
  });
  const crownRows = rows.filter((row) => row && row.isCrown && Number.isFinite(row.guesses));
  const avgGuess = crownRows.length
    ? crownRows.reduce((sum, row) => sum + Number(row.guesses || 0), 0) / crownRows.length
    : null;
  const participationRate = windowDays > 0 && metrics && metrics.totalGames
    ? Math.min(1, metrics.totalGames / windowDays)
    : 0;
  return {
    activeCrownStreak: activeStreak,
    bestCrownStreak: bestStreak,
    avgGuessWhenCrowned: avgGuess,
    participationRate
  };
}

function deriveGroupCallouts(dataset, metrics) {
  if (!Array.isArray(dataset) || !dataset.length) return [];
  const callouts = [];
  const perPlayer = buildPlayerMetricsMap(dataset);
  const totalPlayers = perPlayer.size || 0;
  const totalCrowns = dataset.filter((row) => row && row.isCrown).length;
  const newcomerPlayers = [];
  perPlayer.forEach((playerMetrics, player) => {
    if (!playerMetrics) return;
    if (playerMetrics.totalGames <= 3 && playerMetrics.crownWins > 0) {
      newcomerPlayers.push(player);
    }
  });
  if (newcomerPlayers.length >= Math.max(2, Math.ceil(totalPlayers * 0.2))) {
    callouts.push({
      title: 'Newcomer surge',
      detail: `${newcomerPlayers.length} newer players earned crowns this window.`,
      meta: newcomerPlayers.slice(0, 3).join(', ')
    });
  }
  if (totalCrowns > 0 && totalPlayers > 0) {
    const leaderboard = wordleCrownWins(dataset, totalPlayers);
    if (leaderboard.length) {
      const leader = leaderboard[0];
      const share = leader.winCount ? leader.winCount / totalCrowns : 0;
      if (share >= 0.35) {
        callouts.push({
          title: 'Crown concentration',
          detail: `${leader.player} owns ${formatPercent(share, 0)} of crowns (${leader.winCount}/${totalCrowns}).`
        });
      }
    }
  }
  const ratioPct =
    metrics && metrics.totalGames ? (metrics.crownWins / metrics.totalGames) : 0;
  if (ratioPct >= 0.6) {
    callouts.push({
      title: 'Consistent crowd',
      detail: `Group crown conversion is ${formatPercent(ratioPct, 0)} this window.`
    });
  }
  return callouts;
}

// Rendering
// -----------------------------
function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderPreview(rows, columns) {
  const table = $('previewTable');
  const head = `<thead><tr>${columns.map(c=>`<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`;
  const bodyRows = rows.map(r => {
    return `<tr>${columns.map(c => `<td>${escapeHtml(r[c] ?? '')}</td>`).join('')}</tr>`;
  }).join('');
  const body = `<tbody>${bodyRows}</tbody>`;
  table.innerHTML = head + body;
}

function renderCrownTable(rows, dataset, windowMeta = null) {
  const container = $('crownTable');
  if (!container) return;
  const leaderboardRows = Array.isArray(rows) ? rows : [];
  const playerMetricsMap = buildPlayerMetricsMap(dataset);
  if (leaderboardRows && typeof buildLeaderboardRankings === 'function') {
    leaderboardRows.rankings = buildLeaderboardRankings(playerMetricsMap);
  }
  crownContext = {
    leaderboard: leaderboardRows,
    dataset,
    selectedPlayer: null,
    playerMetrics: playerMetricsMap,
    windowMeta,
    windowDays: windowMeta && windowMeta.limit ? windowMeta.limit : 0
  };
  if (!leaderboardRows.length) {
    container.innerHTML = '<div class="status warn">No Crown Wins detected.</div>';
  } else {
    const head = '<thead><tr><th>Place</th><th>User Name</th><th>Total 👑 Wins</th><th>👑 %</th></tr></thead>';
    const body = leaderboardRows
      .map(r => {
        const ratioPct = (r.ratio * 100).toFixed(1);
        const encoded = encodeURIComponent(r.player);
        const activeClass = (crownContext.selectedPlayer && r.player === crownContext.selectedPlayer) ? ' crownTable__row--active' : '';
        return `<tr class="crownTable__row${activeClass}" data-crown-player-row="${encoded}"><td>${r.place}</td><td><span class="crownTable__name" data-crown-player="${encoded}">${escapeHtml(r.player)}</span></td><td>${r.winCount}</td><td>${ratioPct}%</td></tr>`;
      })
      .join('');
    container.innerHTML = `
      <div class="crownTable__heading">👑 Wins Leaderboard</div>
      <div class="crownTable__layout">
        <div class="crownTable__leaderboard">
          <table>${head}<tbody>${body}</tbody></table>
        </div>
        <div class="crownTable__panel" id="crownTablePanel">
          <div class="status">Select a player to view stats.</div>
        </div>
      </div>
    `;
  }
  container.classList.add('crownTable--visible');
  setGroupStatsPanel();
}

function buildPlayerStatsMarkup(player, metrics, badgeMarkup, insights) {
  const guessOrder = ['1','2','3','4','5','6','X'];
  const rows = guessOrder.map((g) => {
    const label = g === 'X' ? 'X/6 (fail)' : `${g}/6`;
    const total = metrics.buckets[g] || 0;
    const crown = metrics.crownBuckets[g] || 0;
    return `<tr><td>${label}</td><td>${total}</td><td>${crown}</td></tr>`;
  }).join('');
  const ratioPct = metrics.totalGames ? ((metrics.crownWins / metrics.totalGames) * 100).toFixed(1) : '0.0';
  const susWins = typeof metrics.susWins === 'number' ? metrics.susWins : (metrics.buckets['1'] || 0);
  const infoBlock = `
    <div class="playerCard__info">
      <div class="playerCard__title">${escapeHtml(player)}</div>
      <div class="playerCard__stat">Total sus wins: <strong>${susWins}</strong></div>
      <div class="playerCard__stat">Total games played: <strong>${metrics.totalGames}</strong></div>
      <div class="playerCard__stat">&#128081; %: <strong>${ratioPct}%</strong></div>
    </div>
  `;
  const badgeBlock = badgeMarkup ? `<div class="playerCard__badgeWrap">${badgeMarkup}</div>` : '';
  const insightsBlock = insights
    ? `
    <div class="playerCard__insights">
      <div class="playerCard__insight">
        <span>Active crown streak</span>
        <strong>${insights.activeCrownStreak || 0}</strong>
      </div>
      <div class="playerCard__insight">
        <span>Best streak</span>
        <strong>${insights.bestCrownStreak || 0}</strong>
      </div>
      <div class="playerCard__insight">
        <span>Avg guesses when crowned</span>
        <strong>${Number.isFinite(insights.avgGuessWhenCrowned) ? insights.avgGuessWhenCrowned.toFixed(1) : '--'}</strong>
      </div>
      <div class="playerCard__insight">
        <span>Participation rate</span>
        <strong>${formatPercent(insights.participationRate || 0)}</strong>
      </div>
    </div>
  `
    : '';
  return `
    <div class="playerCard">
      <div class="playerCard__header">
        ${infoBlock}
        ${badgeBlock}
        <button class="crownTable__panelBtn" type="button" data-crown-group-panel="true">Close</button>
      </div>
      ${insightsBlock}
      <table class="playerCard__table">
        <thead><tr><th>Round</th><th>Total</th><th>Crown Wins</th></tr></thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function buildGroupStatsMarkup(dataset, metrics, callouts) {
  const players = new Set(dataset.map((r) => r.player)).size;
  const ratioPct = metrics.totalGames ? ((metrics.crownWins / metrics.totalGames) * 100).toFixed(1) : '0.0';
  const guessOrder = ['1','2','3','4','5','6','X'];
  const rows = guessOrder.map((g) => {
    const label = g === 'X' ? 'X/6 (fail)' : `${g}/6`;
    const total = metrics.buckets[g] || 0;
    const crown = metrics.crownBuckets[g] || 0;
    return `<tr><td>${label}</td><td>${total}</td><td>${crown}</td></tr>`;
  }).join('');
  const calloutsMarkup =
    Array.isArray(callouts) && callouts.length
      ? `
      <div class="groupCallouts">
        ${callouts
          .map(
            (entry) => `
            <div class="groupCallouts__item">
              <div class="groupCallouts__title">${escapeHtml(entry.title)}</div>
              <div class="groupCallouts__detail">${escapeHtml(entry.detail)}</div>
              ${entry.meta ? `<div class="groupCallouts__meta">${escapeHtml(entry.meta)}</div>` : ''}
            </div>
          `
          )
          .join('')}
      </div>
    `
      : '';
  return `
    <div class="playerCard">
      <div class="playerCard__title">Group Stats</div>
      <div class="playerCard__stat">Total players: <strong>${players}</strong></div>
      <div class="playerCard__stat">Total games: <strong>${metrics.totalGames}</strong></div>
      <div class="playerCard__stat">Total ???? wins: <strong>${metrics.crownWins}</strong> (${ratioPct}%)</div>
      ${calloutsMarkup}
      <table class="playerCard__table">
        <thead><tr><th>Round</th><th>Total</th><th>???? Wins</th></tr></thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}
function getPlayerBadgesMarkup(context, player) {
  const badges = typeof resolvePlayerBadges === 'function'
    ? resolvePlayerBadges(context, player, { maxBadges: 4 })
    : [resolvePlayerBadge(context, player)].filter(Boolean);
  if (!badges.length) return '';
  if (typeof buildPlayerBadgesMarkup === 'function') {
    return buildPlayerBadgesMarkup(badges, { maxBadges: 4 });
  }
  return badges.map((badge) => buildPlayerBadgeMarkup(badge)).join('');
}

function setActiveCrownPlayer(player) {
  if (!player || !crownContext.dataset.length) return;
  const panel = $('crownTablePanel');
  const container = $('crownTable');
  if (!panel || !container) return;
  crownContext.selectedPlayer = player;
  const metrics = getPlayerMetrics(crownContext, player);
  const badgeMarkup = getPlayerBadgesMarkup(crownContext, player);
  const playerRows = stateStore.getPlayerRows(player);
  const insights = computePlayerInsights(metrics, {
    windowDays: crownContext.windowDays,
    rows: playerRows.length ? playerRows : metrics.rows
  });
  panel.innerHTML = buildPlayerStatsMarkup(player, metrics, badgeMarkup, insights);
  const encoded = encodeURIComponent(player);
  container.querySelectorAll('[data-crown-player-row]').forEach((row) => {
    row.classList.toggle('crownTable__row--active', row.dataset.crownPlayerRow === encoded);
  });
}

function setGroupStatsPanel() {
  const panel = $('crownTablePanel');
  const container = $('crownTable');
  if (!panel) return;
  const dataset = crownContext.dataset || [];
  if (!dataset.length) {
    panel.innerHTML = '<div class="status">Load a Wordle CSV to see group stats.</div>';
    return;
  }
  const metrics = computeGroupMetrics(dataset);
  const callouts = deriveGroupCallouts(dataset, metrics);
  panel.innerHTML = buildGroupStatsMarkup(dataset, metrics, callouts);
  crownContext.selectedPlayer = null;
  if (container) {
    container.querySelectorAll('[data-crown-player-row]').forEach((row) => {
      row.classList.remove('crownTable__row--active');
    });
  }
}

function toggleBadgeExpansion(badge) {
  if (!badge || !badge.classList.contains('playerCard__badge--expandable')) return;
  const willExpand = !badge.classList.contains('playerCard__badge--expanded');
  const wrap = badge.closest('.playerCard__badgeWrap');
  if (willExpand && wrap) {
    wrap.querySelectorAll('.playerCard__badge--expanded').forEach((item) => {
      if (item === badge) return;
      item.classList.remove('playerCard__badge--expanded');
      item.setAttribute('aria-expanded', 'false');
    });
  }
  const expanded = badge.classList.toggle('playerCard__badge--expanded');
  badge.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function setStatus(el, msg, kind) {
  el.className = 'status ' + (kind || '');
  el.innerHTML = msg;
}

function updatePageTitle() {
  const el = $('pageTitle');
  if (!el) return;
  el.textContent = 'Crown Wins Leaderboard';
}

// -----------------------------
// Main actions
// -----------------------------
function onCsvLoaded(rows, columns, sourceName) {
  rows.forEach((r, idx) => {
    Object.defineProperty(r, '__rowIndex', { value: idx, enumerable: false, configurable: true });
  });
  stateStore.setRawData(rows, columns);
  stateStore.setNormalizedWordle([]);
  stateStore.setLastDays(0);
  wordleDateField = null;
  crownModeReady = false;
  updatePageTitle();

  const wordle = looksLikeWordleSummary(columns);
  $('btnExport').disabled = !wordle;
  $('lastDays').disabled = !wordle;

  setStatus(
    $('loadStatus'),
    `Loaded <strong>${rows.length}</strong> rows, <strong>${columns.length}</strong> columns from <strong>${escapeHtml(sourceName)}</strong>.`,
    'ok'
  );

  if (!wordle) {
    updateLastDaysDefault(0);
    renderCrownTable([], [], stateStore.getLastDaysSubset());
    renderPreview(rows, columns);
    setStatus(
      $('leaderboardStatus'),
      'CSV loaded, but the expected Wordle columns (1/6 through X/6 plus crown data) were not found.',
      'warn'
    );
    return;
  }

  wordleDateField = detectDateField(columns);
  const normalizedWordle = normalizeWordle(rows, wordleDateField);
  stateStore.setNormalizedWordle(normalizedWordle);
  crownModeReady = true;
  const defaultWindow = stateStore.setLastDays(stateStore.getTotalDays());
  updateLastDaysDefault(defaultWindow);
  const players = uniq(normalizedWordle.map(r => r.player)).length;
  setStatus(
    $('leaderboardStatus'),
    `Detected Wordle summary format. Normalized to <strong>${normalizedWordle.length}</strong> player-day rows across <strong>${players}</strong> unique players.`,
    'ok'
  );

  if (!autoRenderConfig.done) {
    $('limit').value = autoRenderConfig.limit;
    autoRenderConfig.done = true;
  }
  requestAnimationFrame(() => render());
}

function parseCsvText(text, sourceName) {
  Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    complete: (res) => {
      if (res.errors && res.errors.length) {
        console.warn(res.errors);
      }
      const rows = res.data || [];
      const columns = res.meta && res.meta.fields ? res.meta.fields : (rows[0] ? Object.keys(rows[0]) : []);
      if (!rows.length) {
        setStatus($('loadStatus'), 'CSV parsed but found zero data rows.', 'warn');
        crownModeReady = false;
        stateStore.setRawData([], []);
        stateStore.setNormalizedWordle([]);
        stateStore.setLastDays(0);
        $('btnExport').disabled = true;
        setStatus($('leaderboardStatus'), '', '');
        renderCrownTable([], [], stateStore.getLastDaysSubset());
        $('previewTable').innerHTML = '';
        return;
      }
      onCsvLoaded(rows, columns, sourceName);
    }
  });
}

async function loadDefaultCsv() {
  try {
    const res = await fetch(DEFAULT_CSV_PATH, { cache: 'no-cache' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const buffer = await res.arrayBuffer();
    const decoder = UTF8_DECODER || new TextDecoder('utf-8');
    const text = decoder.decode(buffer);
    parseCsvText(text, DEFAULT_CSV_PATH);
  } catch (err) {
    console.error('Failed to load default CSV', err);
    setStatus($('loadStatus'), `Failed to load default CSV (${DEFAULT_CSV_PATH}). Use the file picker instead.`, 'warn');
  }
}

function render() {
  if (!crownModeReady || !stateStore.hasData()) {
    setStatus($('leaderboardStatus'), 'Load a Wordle CSV first.', 'warn');
    return;
  }

  const lastDaysInput = $('lastDays');
  const requestedDays = lastDaysInput ? Number(lastDaysInput.value) : NaN;
  const appliedDays = stateStore.setLastDays(requestedDays);
  if (lastDaysInput) {
    lastDaysInput.value = appliedDays || '';
  }

  const subset = stateStore.getLastDaysSubset();
  const {
    data: limitedWordle,
    limit: dayLimit,
    selectedRowIndexes,
    latestLabel,
    rowCount
  } = subset;

  if (!limitedWordle.length) {
    setStatus($('leaderboardStatus'), 'No rows available for the requested day window.', 'warn');
    renderCrownTable([], [], subset);
    renderPreview([], stateStore.getRawColumns());
    return;
  }

  const limitInputEl = $('limit');
  const limitValue = stateStore.setLeaderboardLimit(limitInputEl ? Number(limitInputEl.value) : NaN);
  if (limitInputEl) {
    limitInputEl.value = limitValue;
  }

  const rows = wordleCrownWins(limitedWordle, limitValue);
  renderCrownTable(rows, limitedWordle, subset);

  const rawRows = stateStore.getRawRows();
  const rawColumns = stateStore.getRawColumns();
  const previewRows = selectedRowIndexes.size
    ? rawRows.filter((row) => selectedRowIndexes.has(row.__rowIndex))
    : rawRows.slice(Math.max(0, rawRows.length - dayLimit));
  renderPreview(previewRows, rawColumns);

  const latestCopy = latestLabel ? ` Latest day: <strong>${escapeHtml(latestLabel)}</strong>.` : '';
  const baseMsg = `Rendered Crown Wins leaderboard for the last <strong>${dayLimit}</strong> day(s) covering <strong>${rowCount || limitedWordle.length}</strong> CSV rows.`;
  setStatus($('leaderboardStatus'), baseMsg + latestCopy, rows.length ? 'ok' : 'warn');
}

function exportNormalized() {
  const normalizedWordle = stateStore.getNormalizedWordle();
  if (!crownModeReady || !normalizedWordle.length) {
    setStatus($('leaderboardStatus'), 'Nothing to export (Wordle format not detected).', 'warn');
    return;
  }
  const header = ['dayIndex','player','guesses','solved','isCrown','crownRound'];
  const lines = [header.join(',')];
  for (const r of normalizedWordle) {
    const row = header.map(k => {
      const v = r[k];
      if (v === null || v === undefined) return '';
      const s = String(v).replaceAll('"','""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    }).join(',');
    lines.push(row);
  }
  downloadText('normalized_wordle.csv', lines.join('\n'));
  setStatus($('leaderboardStatus'), 'Exported normalized_wordle.csv', 'ok');
}

function clearAll() {
  stateStore.reset();
  stateStore.setLeaderboardLimit(autoRenderConfig.limit);
  wordleDateField = null;
  crownModeReady = false;
  $('previewTable').innerHTML = '';
  const table = $('crownTable');
  if (table) {
    table.innerHTML = '';
    table.classList.remove('crownTable--visible');
  }
  $('file').value = '';
  $('limit').value = autoRenderConfig.limit;
  $('lastDays').value = '';
  $('lastDays').disabled = true;
  $('btnExport').disabled = true;
  setStatus($('loadStatus'), 'No CSV loaded.', '');
  setStatus($('leaderboardStatus'), '', '');
  updatePageTitle();
}

// -----------------------------
// Event wiring
// -----------------------------
$('file').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => parseCsvText(String(reader.result || ''), f.name);
  reader.readAsText(f, 'UTF-8');
});

$('btnLoadSample').addEventListener('click', async () => {
  // A tiny sample mimicking your Wordle summary CSV shape (with date column).
  const sample = [
    'date posted,day streak,crown round,crown,1/6,2/6,3/6,4/6,5/6,6/6,X/6',
    '2025-06-06,"**Your group is on a 1 day streak!**","1/6","@theBestLoser","@theBestLoser","--","@NotMajorPerson","@mediocreplant","@AsA @hereisrachel","--","@sinfulprey @eplex"',
    '2025-06-07,"**Your group is on a 2 day streak!**","3/6","@AsA","--","--","@AsA","@hereisrachel","@Cesh","@MajorDanger","@mediocreplant @sinfulprey"'
  ].join('\n');
  parseCsvText(sample, 'built-in sample');
});

$('btnRender').addEventListener('click', render);
$('btnExport').addEventListener('click', exportNormalized);
$('btnClear').addEventListener('click', clearAll);

$('crownTable').addEventListener('click', (event) => {
  const link = event.target.closest('[data-crown-player]');
  if (link) {
    event.preventDefault();
    const player = decodeURIComponent(link.dataset.crownPlayer || '');
    setActiveCrownPlayer(player);
    return;
  }
  const row = event.target.closest('[data-crown-player-row]');
  if (row) {
    event.preventDefault();
    const player = decodeURIComponent(row.dataset.crownPlayerRow || '');
    setActiveCrownPlayer(player);
    return;
  }
  const groupBtn = event.target.closest('[data-crown-group-panel]');
  if (groupBtn) {
    event.preventDefault();
    setGroupStatsPanel();
    return;
  }
  const badge = event.target.closest('[data-player-badge]');
  if (badge) {
    event.preventDefault();
    toggleBadgeExpansion(badge);
    return;
  }
});

$('crownTable').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const badge = event.target.closest('[data-player-badge]');
  if (!badge) return;
  event.preventDefault();
  toggleBadgeExpansion(badge);
});

// initialize
clearAll();
document.body.classList.toggle('developer-mode', DEVELOPER_MODE);
loadDefaultCsv();
















