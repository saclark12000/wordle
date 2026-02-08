// -----------------------------
// Utilities
// -----------------------------
const $ = (id) => document.getElementById(id);
const CROWN_COL_NAMES = ['👑','ðŸ‘‘','crown'];
const CROWN_ROUND_COL_NAMES = ['👑 Round','ðŸ‘‘ Round','crown round'];

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
  if (dateField) {
    const parsed = parseDateValue(row[dateField]);
    if (parsed) {
      const label = formatDateLabel(parsed);
      return {
        dayIndex: fallbackIndex,
        dayTimestamp: parsed.getTime(),
        dayLabel: label,
        dayKey: label
      };
    }
  }
  return {
    dayIndex: fallbackIndex,
    dayTimestamp: fallbackIndex,
    dayLabel: `Day ${fallbackIndex}`,
    dayKey: String(fallbackIndex)
  };
}

function getDayValueFromRow(row) {
  const ts = Number(row.dayTimestamp);
  if (Number.isFinite(ts)) return ts;
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
let kingContext = { leaderboard: [], dataset: [] };

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
  return { data, limit: requested, maxDays: totalDays, selectedDayKeys, selectedRowIndexes, latestLabel };
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

// -----------------------------
// Data shaping for Wordle presets
// -----------------------------
function wordleRoundDistribution(norm) {
  const buckets = new Map();
  for (const r of norm) {
    const key = r.solved ? String(r.guesses) : 'X';
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const labels = ['1','2','3','4','5','6','X'];
  const data = labels.map(l => buckets.get(l) || 0);
  return { labels, data, title: 'Round distribution (all days)', yLabel: 'Players' };
}

function wordlePlayersPerDay(norm) {
  const map = new Map();
  for (const r of norm) {
    const key = r.dayKey || String(r.dayIndex);
    if (!map.has(key)) {
      map.set(key, { label: r.dayLabel || `Day ${r.dayIndex}`, order: getDayValueFromRow(r), count: 0 });
    }
    map.get(key).count += 1;
  }
  const ordered = [...map.values()].sort((a,b)=>a.order - b.order);
  return {
    labels: ordered.map((entry) => entry.label),
    data: ordered.map((entry) => entry.count),
    title: 'Players per day',
    yLabel: 'Players'
  };
}

function wordleSolveRatePerDay(norm) {
  const stats = new Map();
  for (const r of norm) {
    const key = r.dayKey || String(r.dayIndex);
    if (!stats.has(key)) {
      stats.set(key, { label: r.dayLabel || `Day ${r.dayIndex}`, order: getDayValueFromRow(r), total: 0, solved: 0 });
    }
    const entry = stats.get(key);
    entry.total += 1;
    if (r.solved) entry.solved += 1;
  }
  const ordered = [...stats.values()].sort((a,b)=>a.order - b.order);
  return {
    labels: ordered.map((entry) => entry.label),
    data: ordered.map((entry) => {
      const { total, solved } = entry;
      return total ? Math.round((solved / total) * 1000) / 10 : 0;
    }),
    title: 'Solve rate per day',
    yLabel: 'Solve rate (%)'
  };
}

function wordleAvgGuessesPerDay(norm) {
  const stats = new Map();
  for (const r of norm) {
    if (!r.solved) continue;
    const key = r.dayKey || String(r.dayIndex);
    if (!stats.has(key)) {
      stats.set(key, { label: r.dayLabel || `Day ${r.dayIndex}`, order: getDayValueFromRow(r), sum: 0, count: 0 });
    }
    const entry = stats.get(key);
    entry.sum += r.guesses || 0;
    entry.count += 1;
  }
  const ordered = [...stats.values()].sort((a,b)=>a.order - b.order);
  return {
    labels: ordered.map((entry) => entry.label),
    data: ordered.map((entry) => {
      return Math.round(((entry.sum || 0) / (entry.count || 1)) * 100) / 100;
    }),
    title: 'Average guesses per day (solves only)',
    yLabel: 'Avg guesses'
  };
}

function wordleTopPlayers(norm, limit) {
  const solves = new Map();
  for (const r of norm) {
    if (!r.solved) continue;
    solves.set(r.player, (solves.get(r.player) || 0) + 1);
  }
  const sorted = [...solves.entries()].sort((a,b)=>b[1]-a[1]).slice(0, limit);
  return {
    labels: sorted.map(([p])=>p),
    data: sorted.map(([,c])=>c),
    title: `Top ${limit} players by solves`,
    yLabel: 'Solves'
  };
}

function wordleKingWins(norm, limit) {
  const wins = new Map();
  for (const r of norm) {
    if (!r.isCrown || !r.player) continue;
    wins.set(r.player, (wins.get(r.player) || 0) + 1);
  }
  const sorted = [...wins.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, limit);
  return sorted.map(([player, count], idx) => ({
    place: idx + 1,
    player,
    count
  }));
}

function computePlayerMetrics(norm, player) {
  const buckets = { '1':0,'2':0,'3':0,'4':0,'5':0,'6':0,'X':0,'totalPointValue':0 };
  let kingWins = 0;
  for (const r of norm) {
    console.log('LOGGGGEEEDD computePlayerMetrics for r of norm: ' + JSON.stringify(r));
    
    if (r.player !== player) continue;
    if (r.isCrown) kingWins += 1;
    if (r.solved && r.guesses) {
      const key = String(r.guesses);
      if (buckets[key] !== undefined) buckets[key] += 1;
      buckets['totalPointValue'] += getGuessPoint(key);
      console.log('bucket says : ' + buckets[key]);
      console.log('bucket says : ' + buckets['totalPointValue']);
    } else {
      buckets['X'] += 1;
      buckets['totalPointValue'] += 1;
    }
  }
  return { kingWins, buckets };
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
  const bodyRows = rows.slice(0, 30).map(r => {
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
  kingContext = { leaderboard: rows, dataset };
  if (!rows.length) {
    container.innerHTML = '<div class="status warn">No king wins detected.</div>';
  } else {
    const head = '<thead><tr><th>Place</th><th>User Name</th><th>Total Win Count</th></tr></thead>';
    const body = rows
      .map(r => `<tr><td>${r.place}</td><td><a href="#" data-king-player="${encodeURIComponent(r.player)}">${escapeHtml(r.player)}</a></td><td>${r.count}</td></tr>`)
      .join('');
    container.innerHTML = `<table>${head}<tbody>${body}</tbody></table>`;
  }
  container.classList.add('kingTable--visible');
  $('chart').style.display = 'none';
}

function hideKingTable() {
  const container = $('kingTable');
  if (!container) return;
  container.classList.remove('kingTable--visible');
  container.innerHTML = '';
  $('chart').style.display = 'block';
  kingContext = { leaderboard: [], dataset: [] };
}

function renderKingPlayerDetail(player, metrics) {
  destroyChart();
  const container = $('kingTable');
  if (!container) return;
  const guessOrder = ['1','2','3','4','5','6','X'];
  const rows = guessOrder.map((g) => {
    const label = g === 'X' ? 'X/6 (fail)' : `${g}/6`;
    return `<tr><td>${label}</td><td>${metrics.buckets[g] || 0}</td></tr>`;
  }).join('');
  container.innerHTML = `
    <button class="kingTable__back" type="button" data-king-back="true">← Back to King Wins</button>
    <h3>${escapeHtml(player)}</h3>
    <div class="status">Total king wins: <strong>${metrics.kingWins}</strong></div>
    <div class="status">Total point value: <strong>${metrics.buckets['totalPointValue']}</strong></div>
    <table>
      <thead><tr><th>Metric</th><th>Count</th></tr></thead>
      <tbody>
        <tr><td>King Wins</td><td>${metrics.kingWins}</td></tr>
        ${rows}
      </tbody>
    </table>
    
  `;
  container.classList.add('kingTable--visible');
  $('chart').style.display = 'none';
}

function setStatus(el, msg, kind) {
  el.className = 'status ' + (kind || '');
  el.innerHTML = msg;
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

function render() {
  if (!rawRows.length) {
    setStatus($('chartStatus'), 'Load a CSV first.', 'warn');
    return;
  }

  const type = $('chartType').value;
  const filterText = $('filter').value;
  const filteredRows = applyFilter(rawRows, filterText);

  if (mode === 'wordle') {
    const preset = $('preset').value;
    if (!preset) {
      setStatus($('chartStatus'), 'Pick a Wordle preset.', 'warn');
      return;
    }

    const {
      data: limitedWordle,
      limit: dayLimit,
      maxDays,
      selectedRowIndexes,
      latestLabel
    } = getWordleLastDaysSubset();
    if (!limitedWordle.length) {
      setStatus($('chartStatus'), 'No rows available for the requested day window.', 'warn');
      destroyChart();
      return;
    }

    const limit = Math.max(3, Math.min(50, Number($('limit').value || 15)));
    let shaped;
    if (preset === 'wordle_round_distribution') shaped = wordleRoundDistribution(limitedWordle);
    if (preset === 'wordle_players_per_day') shaped = wordlePlayersPerDay(limitedWordle);
    if (preset === 'wordle_solve_rate') shaped = wordleSolveRatePerDay(limitedWordle);
    if (preset === 'wordle_avg_guesses') shaped = wordleAvgGuessesPerDay(limitedWordle);
    if (preset === 'wordle_top_players') shaped = wordleTopPlayers(limitedWordle, limit);
    if (preset === 'wordle_king_wins') {
      const rows = wordleKingWins(limitedWordle, limit);
      renderKingTable(rows, limitedWordle);
      setStatus(
        $('chartStatus'),
        `Rendered King Wins table (top <strong>${rows.length}</strong> of <strong>${limit}</strong> requested, ${dayLimit} day window).`,
        rows.length ? '' : 'warn'
      );
      const previewSlice = filteredRows.filter((row) => selectedRowIndexes.has(row.__rowIndex));
      renderPreview(previewSlice.length ? previewSlice : filteredRows.slice(Math.max(0, filteredRows.length - dayLimit)), rawColumns);
      return;
    }
    hideKingTable();

    // some presets look better as line charts; let user override
    const suggested = (preset.includes('per_day')) ? 'line' : (preset.includes('distribution') ? 'bar' : type);

    renderChart({
      labels: shaped.labels,
      data: shaped.data,
      title: shaped.title,
      yLabel: shaped.yLabel,
      type: type || suggested
    });

    setStatus(
      $('chartStatus'),
      `Rendered preset: <strong>${escapeHtml(preset)}</strong> (last <strong>${dayLimit}</strong> of <strong>${maxDays}</strong> day${maxDays === 1 ? '' : 's'}${latestLabel ? `, latest: <strong>${escapeHtml(latestLabel)}</strong>` : ''}).`,
      ''
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
  setStatus($('loadStatus'), 'No CSV loaded.', '');
  setStatus($('chartStatus'), '', '');
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

$('kingTable').addEventListener('click', (event) => {
  const link = event.target.closest('[data-king-player]');
  if (link) {
    event.preventDefault();
    const player = decodeURIComponent(link.dataset.kingPlayer || '');
    if (player && kingContext.dataset.length) {
      const metrics = computePlayerMetrics(kingContext.dataset, player);
      renderKingPlayerDetail(player, metrics);
    }
    return;
  }
  const back = event.target.closest('[data-king-back]');
  if (back && kingContext.leaderboard.length) {
    event.preventDefault();
    renderKingTable(kingContext.leaderboard, kingContext.dataset);
  }
});

// initialize
clearAll();
