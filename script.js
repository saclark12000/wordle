// -----------------------------
// Utilities
// -----------------------------
const $ = (id) => document.getElementById(id);
const DEFAULT_CSV_PATH = 'resources/game_data/wordleData.csv';
const DEVELOPER_MODE = new URLSearchParams(window.location.search).get('developer') === 'true';
const CROWN_COL_NAMES = ['👑','ðŸ‘‘','crown'];
const CROWN_ROUND_COL_NAMES = ['👑 Round','ðŸ‘‘ Round','crown round'];
const PRESET_TITLES = {
  wordle_king_wins: 'King Wins'
};

function uniq(arr) {
  return [...new Set(arr)];
}

function toNumberMaybe(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s === '') return NaN;
  // tolerate commas and percent signs
  const cleaned = s.replace(/,/g, '').replace(/%/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function stableStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function normalizeHandle(handle) {
  if (!handle) return null;
  const h = String(handle).trim();
  if (h === '' || h === '--') return null;
  return h;
}

function splitHandles(cell) {
  if (!cell) return [];
  const s = String(cell).trim();
  if (s === '' || s === '--') return [];
  // Wordle bot cells often contain "@a @b @c" or "@a @b" with extra whitespace
  return s.split(/\s+/g).map(normalizeHandle).filter(Boolean);
}

function looksLikeWordleSummary(columns) {
  const needed = ['1/6','2/6','3/6','4/6','5/6','6/6','X/6'];
  return needed.every(c => columns.includes(c));
}

function getFirstAvailable(obj, candidates) {
  if (!obj) return undefined;
  const lowerKeyMap = new Map();
  Object.keys(obj).forEach((key) => lowerKeyMap.set(String(key).toLowerCase(), key));
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return obj[key];
    }
    const lowered = typeof key === 'string' ? key.toLowerCase() : key;
    if (lowerKeyMap.has(lowered)) {
      return obj[lowerKeyMap.get(lowered)];
    }
  }
  return undefined;
}

function detectDateField(columns) {
  const target = 'date posted';
  return columns.find((col) => String(col || '').trim().toLowerCase() === target) || null;
}

function parseDateValue(value) {
  if (!value && value !== 0) return null;
  const s = String(value).trim();
  if (!s) return null;
  const parsed = Date.parse(s);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

function formatDateLabel(date) {
  return date.toISOString().split('T')[0];
}

function deriveDayMeta(row, idx, dateField) {
  const fallbackIndex = idx + 1;
  let dayLabel = `Day ${fallbackIndex}`;
  let timestamp = fallbackIndex;
  if (dateField) {
    const parsed = parseDateValue(row[dateField]);
    if (parsed) {
      dayLabel = formatDateLabel(parsed);
      timestamp = parsed.getTime();
    }
  }
  const uniqueKey = `row-${fallbackIndex}`;
  return {
    dayIndex: fallbackIndex,
    dayTimestamp: timestamp,
    dayLabel,
    dayKey: uniqueKey
  };
}

function getDayValueFromRow(row) {
  const ts = Number(row.dayTimestamp);
  if (Number.isFinite(ts)) {
    const idx = Number(row.dayIndex) || 0;
    return ts + idx / 1000;
  }
  const idx = Number(row.dayIndex);
  return Number.isFinite(idx) ? idx : 0;
}

// -----------------------------
// State
// -----------------------------
let rawRows = [];
let rawColumns = [];
let mode = 'none'; // none | wordle | generic
let normalizedWordle = []; // tidy rows
let wordleDateField = null;
let chart = null;
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
let autoRenderConfig = { preset: 'wordle_king_wins', limit: 25, done: false };
let currentWordleSubset = [];

// -----------------------------
// Wordle normalization
// Produces rows like:
// { dayIndex, dayLabel, dayTimestamp, dayKey, player, guesses, solved, crown, crownRound }
// -----------------------------
function normalizeWordle(rows, dateField) {
  const out = [];
  const guessCols = ['1/6','2/6','3/6','4/6','5/6','6/6','X/6'];

  rows.forEach((r, idx) => {
    const dayMeta = deriveDayMeta(r, idx, dateField);
    const crownRaw = getFirstAvailable(r, CROWN_COL_NAMES);
    const crownHandles = splitHandles(crownRaw);
    const crownRoundValue = getFirstAvailable(r, CROWN_ROUND_COL_NAMES);
    const crownRound = (crownRoundValue || '').toString().trim() || null;
    guessCols.forEach((col) => {
      const handles = splitHandles(r[col]);
      handles.forEach((player) => {
        const guesses = col === 'X/6' ? null : Number(col.split('/')[0]);
        const solved = col !== 'X/6';
        out.push({
          ...dayMeta,
          player,
          guesses,
          solved,
          isCrown: crownHandles.includes(player),
          crownRound,
          sourceRowIndex: typeof r.__rowIndex === 'number' ? r.__rowIndex : idx
        });
      });
    });
  });

  return out;
}

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

function wordleKingWins(norm, limit) {
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
function applyFilter(rows, filterText) {
  const ft = (filterText || '').trim();
  if (!ft) return rows;
  const needle = ft.toLowerCase();
  return rows.filter(r => stableStringify(r).toLowerCase().includes(needle));
}

function aggregate(rows, xKey, yKey, agg) {
  if (agg === 'none') {
    // return point arrays
    const labels = rows.map((_, i) => String(i+1));
    const points = rows.map(r => ({ x: r[xKey], y: r[yKey] }));
    return { labels, points };
  }

  const bucket = new Map();
  const bucketCount = new Map();

  for (const r of rows) {
    const x = r[xKey];
    const key = (x === null || x === undefined || String(x).trim()==='') ? '(blank)' : String(x);
    if (agg === 'count') {
      bucket.set(key, (bucket.get(key) || 0) + 1);
    } else {
      const y = toNumberMaybe(r[yKey]);
      if (!Number.isFinite(y)) continue;
      bucket.set(key, (bucket.get(key) || 0) + y);
      bucketCount.set(key, (bucketCount.get(key) || 0) + 1);
    }
  }

  const labels = [...bucket.keys()];
  const data = labels.map(k => {
    if (agg === 'count') return bucket.get(k);
    if (agg === 'sum') return bucket.get(k);
    if (agg === 'avg') {
      const s = bucket.get(k) || 0;
      const c = bucketCount.get(k) || 1;
      return Math.round((s / c) * 100) / 100;
    }
    return bucket.get(k);
  });

  return { labels, data };
}

// -----------------------------
// Rendering
// -----------------------------
function setMode(newMode) {
  mode = newMode;
  const pills = [];
  if (mode === 'none') pills.push('<span class="pill">No data loaded</span>');
  if (mode === 'wordle') pills.push('<span class="pill">Detected: Wordle summary CSV</span>');
  if (mode === 'generic') pills.push('<span class="pill">Detected: Generic CSV</span>');
  $('modePills').innerHTML = pills.join('');

  // Presets only make sense in wordle mode
  $('preset').disabled = (mode !== 'wordle');
  $('btnExport').disabled = (mode !== 'wordle');

  // Generic selectors only make sense in generic mode
  const genericDisabled = (mode !== 'generic');
  $('xCol').disabled = genericDisabled;
  $('yCol').disabled = genericDisabled;
  $('agg').disabled = genericDisabled;

  const lastDaysDisabled = (mode !== 'wordle');
  $('lastDays').disabled = lastDaysDisabled;
  if (lastDaysDisabled) {
    $('lastDays').value = '';
  }

  // Chart type always allowed
}

function populateGenericSelectors(columns) {
  const makeOptions = (cols) => cols.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  $('xCol').innerHTML = makeOptions(columns);
  $('yCol').innerHTML = makeOptions(columns);

  // reasonable default picks
  if (columns.length) {
    $('xCol').value = columns[0];
    $('yCol').value = columns[Math.min(1, columns.length-1)];
  }
}

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

function destroyChart() {
  if (chart) {
    chart.destroy();
    chart = null;
  }
}

function renderChart({ labels, data, points, title, yLabel, type }) {
  destroyChart();
  hideKingTable();
  const ctx = $('chart');

  const chartType = type || 'bar';

  const dataset = {
    label: yLabel || 'Value',
    data: points ? points : data,
    // Do NOT specify colors; let Chart.js pick defaults.
    borderWidth: 2,
    pointRadius: 3
  };

  const isScatter = chartType === 'scatter';

  chart = new Chart(ctx, {
    type: isScatter ? 'scatter' : chartType,
    data: {
      labels: isScatter ? undefined : labels,
      datasets: [dataset]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: !!title,
          text: title
        },
        legend: {
          display: true
        }
      },
      scales: {
        x: {
          title: { display: true, text: isScatter ? 'X' : 'Category' },
          ticks: { maxRotation: 70, minRotation: 0 }
        },
        y: {
          title: { display: true, text: yLabel || 'Value' },
          beginAtZero: true
        }
      }
    }
  });
}

function renderKingTable(rows, dataset) {
  destroyChart();
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
    const head = '<thead><tr><th>Place</th><th>User Name</th><th>Total 👑 Wins</th><th>👑 %</th></tr></thead>';
    const body = rows
      .map(r => {
        const ratioPct = (r.ratio * 100).toFixed(1);
        const encoded = encodeURIComponent(r.player);
        const activeClass = (kingContext.selectedPlayer && r.player === kingContext.selectedPlayer) ? ' kingTable__row--active' : '';
        return `<tr class="kingTable__row${activeClass}" data-king-player-row="${encoded}"><td>${r.place}</td><td><span class="kingTable__name" data-king-player="${encoded}">${escapeHtml(r.player)}</span></td><td>${r.winCount}</td><td>${ratioPct}%</td></tr>`;
      })
      .join('');
    container.innerHTML = `
      <div class="kingTable__heading">👑 Wins Leaderboard</div>
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
  $('chart').style.display = 'none';
  setGroupStatsPanel();
}

function hideKingTable() {
  const container = $('kingTable');
  if (!container) return;
  container.classList.remove('kingTable--visible');
  container.innerHTML = '';
  $('chart').style.display = 'block';
  kingContext = createKingContext();
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
        <button class="kingTable__panelBtn" type="button" data-king-group-panel="true">✖</button>
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
      <div class="playerCard__stat">Total 👑 wins: <strong>${metrics.kingWins}</strong> (${ratioPct}%)</div>
      <table class="playerCard__table">
        <thead><tr><th>Round</th><th>Total</th><th>👑 Wins</th></tr></thead>
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
  let title = 'CSV Insights';
  if (mode === 'wordle') {
    const preset = $('preset').value;
    title = PRESET_TITLES[preset] || 'Wordle Insights';
  } else if (mode === 'generic') {
    title = 'Custom Chart';
  }
  title='Wordle-Hurdle Stats!'
  el.textContent = title;
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

  const wordle = looksLikeWordleSummary(columns);
  setMode(wordle ? 'wordle' : 'generic');
  updatePageTitle();

  setStatus($('loadStatus'), `Loaded <strong>${rows.length}</strong> rows, <strong>${columns.length}</strong> columns from <strong>${escapeHtml(sourceName)}</strong>.`, 'ok');

  if (wordle) {
    wordleDateField = detectDateField(columns);
    normalizedWordle = normalizeWordle(rows, wordleDateField);
    updateLastDaysDefault(getWordleTotalDays());
    const players = uniq(normalizedWordle.map(r => r.player)).length;
    setStatus(
      $('chartStatus'),
      `Detected Wordle summary format. Normalized to <strong>${normalizedWordle.length}</strong> player-day rows across <strong>${players}</strong> unique players. Pick a preset and hit <strong>Render</strong>.`,
      'ok'
    );
    if (!autoRenderConfig.done) {
      $('preset').value = autoRenderConfig.preset;
      $('limit').value = autoRenderConfig.limit;
      autoRenderConfig.done = true;
      updatePageTitle();
      requestAnimationFrame(() => render());
    }
  } else {
    wordleDateField = null;
    updateLastDaysDefault(0);
    setStatus($('chartStatus'), `Generic CSV mode. Pick X/Y columns and aggregation, then hit <strong>Render</strong>.`, '');
  }

  populateGenericSelectors(columns);
  renderPreview(rows, columns);
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
        setMode('none');
        destroyChart();
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
    const text = await res.text();
    parseCsvText(text, DEFAULT_CSV_PATH);
  } catch (err) {
    console.error('Failed to load default CSV', err);
    setStatus($('loadStatus'), `Failed to load default CSV (${DEFAULT_CSV_PATH}). Use the file picker instead.`, 'warn');
  }
}

function render() {
  if (!rawRows.length) {
    setStatus($('chartStatus'), 'Load a CSV first.', 'warn');
    return;
  }

  const type = $('chartType').value;
  const filterText = $('filter').value;
  const filteredRows = applyFilter(rawRows, filterText);
  currentWordleSubset = [];

  if (mode === 'wordle') {
    const preset = $('preset').value;
    if (!preset) {
      setStatus($('chartStatus'), 'Pick a Wordle preset.', 'warn');
      updatePageTitle();
      return;
    }

    const {
      data: limitedWordle,
      limit: dayLimit,
      maxDays,
      selectedRowIndexes,
      latestLabel,
      rowCount
    } = getWordleLastDaysSubset();
    currentWordleSubset = limitedWordle;
    if (!limitedWordle.length) {
      setStatus($('chartStatus'), 'No rows available for the requested day window.', 'warn');
      destroyChart();
      return;
    }

    const limit = Math.max(3, Math.min(50, Number($('limit').value || 15)));
    if (preset !== 'wordle_king_wins') {
      hideKingTable();
      setStatus($('chartStatus'), 'Only the King Wins preset is available. Please select it to continue.', 'warn');
      return;
    }
    const rows = wordleKingWins(limitedWordle, limit);
    renderKingTable(rows, limitedWordle);
    setStatus(
      $('chartStatus'),
      `Rendered King Wins table (top <strong>${rows.length}</strong> of <strong>${limit}</strong> requested, ${dayLimit} day window / ${rowCount} CSV rows).`,
      rows.length ? '' : 'warn'
    );
    const previewSlice = filteredRows.filter((row) => selectedRowIndexes.has(row.__rowIndex));
    renderPreview(previewSlice.length ? previewSlice : filteredRows.slice(Math.max(0, filteredRows.length - dayLimit)), rawColumns);
    return;
  }

  hideKingTable();
  // generic
  const xKey = $('xCol').value;
  const yKey = $('yCol').value;
  const agg = $('agg').value;
  updatePageTitle();

  renderPreview(filteredRows, rawColumns);

  const shaped = aggregate(filteredRows, xKey, yKey, agg);

  if (type === 'scatter' || agg === 'none') {
    const points = filteredRows
      .map(r => ({ x: toNumberMaybe(r[xKey]), y: toNumberMaybe(r[yKey]) }))
      .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));

    if (!points.length) {
      setStatus($('chartStatus'), 'No numeric points to plot. For scatter/raw plots, X and Y should be numeric.', 'warn');
      destroyChart();
      return;
    }

    renderChart({
      points,
      title: `${yKey} vs ${xKey}`,
      yLabel: yKey,
      type: 'scatter'
    });

    setStatus($('chartStatus'), `Rendered scatter from <strong>${points.length}</strong> points (after filter).`, '');
    return;
  }

  // aggregated
  if (!shaped.labels.length) {
    setStatus($('chartStatus'), 'Aggregation produced no data. Try different columns or remove filter.', 'warn');
    destroyChart();
    return;
  }

  renderChart({
    labels: shaped.labels,
    data: shaped.data,
    title: `${agg.toUpperCase()} of ${agg === 'count' ? '' : yKey} by ${xKey}`.replace(/\s+/g,' ').trim(),
    yLabel: agg === 'count' ? 'Count' : (agg === 'sum' ? `Sum(${yKey})` : `Avg(${yKey})`),
    type
  });

  setStatus($('chartStatus'), `Rendered ${escapeHtml(type)} chart with <strong>${shaped.labels.length}</strong> categories (after filter).`, '');
}

function exportNormalized() {
  if (mode !== 'wordle' || !normalizedWordle.length) {
    setStatus($('chartStatus'), 'Nothing to export (Wordle format not detected).', 'warn');
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
  setStatus($('chartStatus'), 'Exported normalized_wordle.csv', 'ok');
}

function clearAll() {
  rawRows = [];
  rawColumns = [];
  normalizedWordle = [];
  wordleDateField = null;
  setMode('none');
  destroyChart();
  $('previewTable').innerHTML = '';
  $('file').value = '';
  $('filter').value = '';
  $('preset').value = '';
  $('limit').value = autoRenderConfig.limit;
  setStatus($('loadStatus'), 'No CSV loaded.', '');
  setStatus($('chartStatus'), '', '');
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
  reader.readAsText(f);
});

$('btnLoadSample').addEventListener('click', async () => {
  // A tiny sample mimicking your Wordle summary CSV shape (with date column).
  const sample = `date posted,day streak,ðŸ‘‘ Round,ðŸ‘‘,1/6,2/6,3/6,4/6,5/6,6/6,X/6\n` +
    `2025-06-06,"**Your group is on a 1 day streak!**","1/6","@theBestLoser","@theBestLoser","--","@NotMajorPerson","@mediocreplant","@AsA @hereisrachel","--","@sinfulprey @eplex"\n` +
    `2025-06-07,"**Your group is on a 2 day streak!**","3/6","@AsA","--","--","@AsA","@hereisrachel","@Cesh","@MajorDanger","@mediocreplant @sinfulprey"`;
  parseCsvText(sample, 'built-in sample');
});

$('btnRender').addEventListener('click', render);
$('btnExport').addEventListener('click', exportNormalized);
$('btnClear').addEventListener('click', clearAll);
$('preset').addEventListener('change', updatePageTitle);
const groupStatsLink = $('groupStatsLink');
if (groupStatsLink) {
  groupStatsLink.addEventListener('click', (event) => {
    event.preventDefault();
    renderGroupStats();
  });
}

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
