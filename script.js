// -----------------------------
// Utilities
// -----------------------------
const $ = (id) => document.getElementById(id);
const DEFAULT_CSV_PATH = 'resources/game_data/wordleData.csv';
const DEVELOPER_MODE = new URLSearchParams(window.location.search).get('developer') === 'true';
const KingWinsCore = window.KingWinsCore || {};
const {
  looksLikeWordleSummary,
  normalizeWordle,
  detectDateField,
  wordleKingWins,
  getDayValueFromRow
} = KingWinsCore;

if (!looksLikeWordleSummary || !normalizeWordle || !wordleKingWins || !getDayValueFromRow) {
  throw new Error('KingWinsCore module failed to load.');
}

const UTF8_DECODER = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

function uniq(arr) {
  return [...new Set(arr)];
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
let rawRows = [];
let rawColumns = [];
let normalizedWordle = []; // tidy rows
let wordleDateField = null;
let kingModeReady = false;
const {
  createKingContext,
  createEmptyPlayerMetrics,
  updatePlayerMetricsFromRow,
  buildPlayerMetricsMap,
  getPlayerMetrics,
  resolvePlayerBadge,
  buildPlayerBadgeMarkup
} = window.BadgeSystem || {};

if (!createKingContext || !resolvePlayerBadge) {
  throw new Error('BadgeSystem module failed to load.');
}

let kingContext = createKingContext();
let autoRenderConfig = { limit: 25, done: false };

function getWordleDayEntries() {
  const map = new Map();
  for (const row of normalizedWordle) {
    const key = row.dayKey || String(row.dayIndex);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: row.dayLabel || `Day ${row.dayIndex}`,
        value: getDayValueFromRow(row),
        rowIndex: typeof row.sourceRowIndex === 'number' ? row.sourceRowIndex : null
      });
    }
  }
  return [...map.values()].sort((a, b) => a.value - b.value);
}

function getWordleTotalDays() {
  return getWordleDayEntries().length;
}

function getWordleLastDaysSubset() {
  const days = getWordleDayEntries();
  const totalDays = days.length;
  if (!totalDays) return { data: [], limit: 0, maxDays: 0, selectedDayKeys: new Set(), selectedRowIndexes: new Set() };
  const input = $('lastDays');
  let requested = Number(input.value);
  if (!Number.isFinite(requested) || requested <= 0) requested = totalDays;
  requested = Math.max(1, Math.min(totalDays, Math.floor(requested)));
  input.value = requested;
  const selectedEntries = days.slice(totalDays - requested);
  const selectedDayKeys = new Set(selectedEntries.map((d) => d.key));
  const selectedRowIndexes = new Set(
    selectedEntries
      .map((d) => d.rowIndex)
      .filter((idx) => idx !== null && idx !== undefined)
  );
  const data = normalizedWordle.filter((r) => selectedDayKeys.has(r.dayKey || String(r.dayIndex)));
  const latestLabel = selectedEntries.length ? selectedEntries[selectedEntries.length - 1].label : '';
  return {
    data,
    limit: requested,
    maxDays: totalDays,
    selectedDayKeys,
    selectedRowIndexes,
    latestLabel,
    rowCount: selectedRowIndexes.size
  };
}

function updateLastDaysDefault(maxDay) {
  const input = $('lastDays');
  if (!input) return;
  if (maxDay) {
    input.value = maxDay;
  } else {
    input.value = '';
  }
}

function wordleKingWinsFunc(norm, limit) {
  const wins = new Map();
  const games = new Map();
  for (const r of norm) {
    if (!r.player) continue;
    games.set(r.player, (games.get(r.player) || 0) + 1);
    if (r.isCrown) {
      wins.set(r.player, (wins.get(r.player) || 0) + 1);
    }
  }
  const sorted = [...games.entries()]
    .map(([player, totalGames]) => ({
      player,
      totalGames,
      winCount: wins.get(player) || 0,
      ratio: totalGames ? (wins.get(player) || 0) / totalGames : 0
    }))
    .sort((a, b) => {
      if (b.winCount !== a.winCount) return b.winCount - a.winCount;
      return a.player.localeCompare(b.player);
    })
    .slice(0, limit);
  return sorted.map((entry, idx) => ({ place: idx + 1, ...entry }));
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

function getGuessPoint(key) {
  switch (key) {
    case 1:
      return 21;
      break;
    case 2:
      return 20;
      break;
    case 3:
      return 18;
      break;
    case 4:
      return 15;
      break;
    case 5:
      return 11;
      break;
    case 6:
      return 6;
      break;
    default:
      return 1;
      break;
  }
}

// -----------------------------
// Generic builder
// -----------------------------
// -----------------------------
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

function renderKingTable(rows, dataset) {
  const container = $('kingTable');
  if (!container) return;
  kingContext = {
    leaderboard: rows,
    dataset,
    selectedPlayer: null,
    playerMetrics: buildPlayerMetricsMap(dataset)
  };
  if (!rows.length) {
    container.innerHTML = '<div class="status warn">No king wins detected.</div>';
  } else {
    const head = '<thead><tr><th>Place</th><th>User Name</th><th>Total ðŸ‘‘ Wins</th><th>ðŸ‘‘ %</th></tr></thead>';
    const body = rows
      .map(r => {
        const ratioPct = (r.ratio * 100).toFixed(1);
        const encoded = encodeURIComponent(r.player);
        const activeClass = (kingContext.selectedPlayer && r.player === kingContext.selectedPlayer) ? ' kingTable__row--active' : '';
        return `<tr class="kingTable__row${activeClass}" data-king-player-row="${encoded}"><td>${r.place}</td><td><span class="kingTable__name" data-king-player="${encoded}">${escapeHtml(r.player)}</span></td><td>${r.winCount}</td><td>${ratioPct}%</td></tr>`;
      })
      .join('');
    container.innerHTML = `
      <div class="kingTable__heading">ðŸ‘‘ Wins Leaderboard</div>
      <div class="kingTable__layout">
        <div class="kingTable__leaderboard">
          <table>${head}<tbody>${body}</tbody></table>
        </div>
        <div class="kingTable__panel" id="kingTablePanel">
          <div class="status">Select a player to view stats.</div>
        </div>
      </div>
    `;
  }
  container.classList.add('kingTable--visible');
  setGroupStatsPanel();
}

function buildPlayerStatsMarkup(player, metrics, badgeMarkup) {
  const guessOrder = ['1','2','3','4','5','6','X'];
  const rows = guessOrder.map((g) => {
    const label = g === 'X' ? 'X/6 (fail)' : `${g}/6`;
    const total = metrics.buckets[g] || 0;
    const king = metrics.kingBuckets[g] || 0;
    return `<tr><td>${label}</td><td>${total}</td><td>${king}</td></tr>`;
  }).join('');
  const ratioPct = metrics.totalGames ? ((metrics.kingWins / metrics.totalGames) * 100).toFixed(1) : '0.0';
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
  return `
    <div class="playerCard">
      <div class="playerCard__header">
        ${infoBlock}
        ${badgeBlock}
        <button class="kingTable__panelBtn" type="button" data-king-group-panel="true">Close</button>
      </div>
      <table class="playerCard__table">
        <thead><tr><th>Round</th><th>Total</th><th>King Wins</th></tr></thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function buildGroupStatsMarkup(dataset, metrics) {
  const players = new Set(dataset.map((r) => r.player)).size;
  const ratioPct = metrics.totalGames ? ((metrics.kingWins / metrics.totalGames) * 100).toFixed(1) : '0.0';
  const guessOrder = ['1','2','3','4','5','6','X'];
  const rows = guessOrder.map((g) => {
    const label = g === 'X' ? 'X/6 (fail)' : `${g}/6`;
    const total = metrics.buckets[g] || 0;
    const king = metrics.kingBuckets[g] || 0;
    return `<tr><td>${label}</td><td>${total}</td><td>${king}</td></tr>`;
  }).join('');
  return `
    <div class="playerCard">
      <div class="playerCard__title">Group Stats</div>
      <div class="playerCard__stat">Total players: <strong>${players}</strong></div>
      <div class="playerCard__stat">Total games: <strong>${metrics.totalGames}</strong></div>
      <div class="playerCard__stat">Total ðŸ‘‘ wins: <strong>${metrics.kingWins}</strong> (${ratioPct}%)</div>
      <table class="playerCard__table">
        <thead><tr><th>Round</th><th>Total</th><th>ðŸ‘‘ Wins</th></tr></thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function setActiveKingPlayer(player) {
  if (!player || !kingContext.dataset.length) return;
  const panel = $('kingTablePanel');
  const container = $('kingTable');
  if (!panel || !container) return;
  kingContext.selectedPlayer = player;
  const metrics = getPlayerMetrics(kingContext, player);
  const badge = resolvePlayerBadge(kingContext, player);
  const badgeMarkup = buildPlayerBadgeMarkup(badge);
  panel.innerHTML = buildPlayerStatsMarkup(player, metrics, badgeMarkup);
  const encoded = encodeURIComponent(player);
  container.querySelectorAll('[data-king-player-row]').forEach((row) => {
    row.classList.toggle('kingTable__row--active', row.dataset.kingPlayerRow === encoded);
  });
}

function setGroupStatsPanel() {
  const panel = $('kingTablePanel');
  const container = $('kingTable');
  if (!panel) return;
  const dataset = kingContext.dataset || [];
  if (!dataset.length) {
    panel.innerHTML = '<div class="status">Load a Wordle CSV to see group stats.</div>';
    return;
  }
  const metrics = computeGroupMetrics(dataset);
  panel.innerHTML = buildGroupStatsMarkup(dataset, metrics);
  kingContext.selectedPlayer = null;
  if (container) {
    container.querySelectorAll('[data-king-player-row]').forEach((row) => {
      row.classList.remove('kingTable__row--active');
    });
  }
}

function toggleBadgeExpansion(badge) {
  if (!badge || !badge.classList.contains('playerCard__badge--expandable')) return;
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
  el.textContent = 'King Wins Leaderboard';
}

// -----------------------------
// Main actions
// -----------------------------
function onCsvLoaded(rows, columns, sourceName) {
  rows.forEach((r, idx) => {
    Object.defineProperty(r, '__rowIndex', { value: idx, enumerable: false, configurable: true });
  });
  rawRows = rows;
  rawColumns = columns;
  normalizedWordle = [];
  wordleDateField = null;
  kingModeReady = false;
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
    renderKingTable([], []);
    renderPreview(rows, columns);
    setStatus(
      $('leaderboardStatus'),
      'CSV loaded, but the expected Wordle columns (1/6 through X/6 plus crown data) were not found.',
      'warn'
    );
    return;
  }

  wordleDateField = detectDateField(columns);
  normalizedWordle = normalizeWordle(rows, wordleDateField);
  kingModeReady = true;
  updateLastDaysDefault(getWordleTotalDays());
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
        kingModeReady = false;
        normalizedWordle = [];
        $('btnExport').disabled = true;
        setStatus($('leaderboardStatus'), '', '');
        renderKingTable([], []);
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
  if (!kingModeReady || !normalizedWordle.length) {
    setStatus($('leaderboardStatus'), 'Load a Wordle CSV first.', 'warn');
    return;
  }

  const {
    data: limitedWordle,
    limit: dayLimit,
    selectedRowIndexes,
    latestLabel,
    rowCount
  } = getWordleLastDaysSubset();

  if (!limitedWordle.length) {
    setStatus($('leaderboardStatus'), 'No rows available for the requested day window.', 'warn');
    renderKingTable([], []);
    renderPreview([], rawColumns);
    return;
  }

  const limitInputEl = $('limit');
  let limitValue = Number(limitInputEl.value);
  if (!Number.isFinite(limitValue)) {
    limitValue = autoRenderConfig.limit;
  }
  limitValue = Math.max(3, Math.min(50, Math.floor(limitValue)));
  limitInputEl.value = limitValue;

  const rows = wordleKingWinsFunc(limitedWordle, limitValue);
  renderKingTable(rows, limitedWordle);

  const previewRows = selectedRowIndexes.size
    ? rawRows.filter((row) => selectedRowIndexes.has(row.__rowIndex))
    : rawRows.slice(Math.max(0, rawRows.length - dayLimit));
  renderPreview(previewRows, rawColumns);

  const latestCopy = latestLabel ? ` Latest day: <strong>${escapeHtml(latestLabel)}</strong>.` : '';
  const baseMsg = `Rendered King Wins leaderboard for the last <strong>${dayLimit}</strong> day(s) covering <strong>${rowCount || limitedWordle.length}</strong> CSV rows.`;
  setStatus($('leaderboardStatus'), baseMsg + latestCopy, rows.length ? 'ok' : 'warn');
}

function exportNormalized() {
  if (!kingModeReady || !normalizedWordle.length) {
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
  rawRows = [];
  rawColumns = [];
  normalizedWordle = [];
  wordleDateField = null;
  kingModeReady = false;
  $('previewTable').innerHTML = '';
  const table = $('kingTable');
  if (table) {
    table.innerHTML = '';
    table.classList.remove('kingTable--visible');
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

$('kingTable').addEventListener('click', (event) => {
  const link = event.target.closest('[data-king-player]');
  if (link) {
    event.preventDefault();
    const player = decodeURIComponent(link.dataset.kingPlayer || '');
    setActiveKingPlayer(player);
    return;
  }
  const row = event.target.closest('[data-king-player-row]');
  if (row) {
    event.preventDefault();
    const player = decodeURIComponent(row.dataset.kingPlayerRow || '');
    setActiveKingPlayer(player);
    return;
  }
  const groupBtn = event.target.closest('[data-king-group-panel]');
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
  const closeGroup = event.target.closest('[data-group-close]');
  if (closeGroup) {
    event.preventDefault();
    render();
  }
});

$('kingTable').addEventListener('keydown', (event) => {
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
