// -----------------------------
// Utilities
// -----------------------------
const $ = (id) => document.getElementById(id);

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

// -----------------------------
// State
// -----------------------------
let rawRows = [];
let rawColumns = [];
let mode = 'none'; // none | wordle | generic
let normalizedWordle = []; // tidy rows
let chart = null;

// -----------------------------
// Wordle normalization
// Produces rows like:
// { dayIndex, player, guesses, solved, crown, crownRound }
// -----------------------------
function normalizeWordle(rows) {
  const out = [];
  const guessCols = ['1/6','2/6','3/6','4/6','5/6','6/6','X/6'];

  rows.forEach((r, idx) => {
    const dayIndex = idx + 1; // no explicit date in your CSV; you can replace this if you add a Date column later
    const crown = normalizeHandle(r['ðŸ‘‘']);
    const crownRound = (r['ðŸ‘‘ Round'] || '').toString().trim() || null;

    guessCols.forEach((col) => {
      const handles = splitHandles(r[col]);
      handles.forEach((player) => {
        const guesses = col === 'X/6' ? null : Number(col.split('/')[0]);
        const solved = col !== 'X/6';
        out.push({
          dayIndex,
          player,
          guesses,
          solved,
          isCrown: crown && player === crown,
          crownRound
        });
      });
    });
  });

  return out;
}

function getMaxDayIndex() {
  return normalizedWordle.reduce((max, row) => Math.max(max, Number(row.dayIndex) || 0), 0);
}

function getWordleLastDaysSubset() {
  const maxDay = getMaxDayIndex();
  if (!maxDay) return { data: [], limit: 0, maxDay: 0 };
  const input = $('lastDays');
  let requested = Number(input.value);
  if (!Number.isFinite(requested) || requested <= 0) requested = maxDay;
  requested = Math.max(1, Math.min(maxDay, Math.floor(requested)));
  input.value = requested;
  const minDay = Math.max(1, maxDay - requested + 1);
  const data = normalizedWordle.filter(r => r.dayIndex >= minDay);
  return { data, limit: requested, maxDay };
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
    map.set(r.dayIndex, (map.get(r.dayIndex) || 0) + 1);
  }
  const labels = [...map.keys()].sort((a,b)=>a-b).map(String);
  const data = labels.map(l => map.get(Number(l)) || 0);
  return { labels, data, title: 'Players per day', yLabel: 'Players' };
}

function wordleSolveRatePerDay(norm) {
  const total = new Map();
  const solved = new Map();
  for (const r of norm) {
    total.set(r.dayIndex, (total.get(r.dayIndex) || 0) + 1);
    if (r.solved) solved.set(r.dayIndex, (solved.get(r.dayIndex) || 0) + 1);
  }
  const labels = [...total.keys()].sort((a,b)=>a-b).map(String);
  const data = labels.map(l => {
    const d = Number(l);
    const t = total.get(d) || 0;
    const s = solved.get(d) || 0;
    return t ? Math.round((s / t) * 1000) / 10 : 0;
  });
  return { labels, data, title: 'Solve rate per day', yLabel: 'Solve rate (%)' };
}

function wordleAvgGuessesPerDay(norm) {
  const sum = new Map();
  const cnt = new Map();
  for (const r of norm) {
    if (!r.solved) continue;
    sum.set(r.dayIndex, (sum.get(r.dayIndex) || 0) + r.guesses);
    cnt.set(r.dayIndex, (cnt.get(r.dayIndex) || 0) + 1);
  }
  const labels = [...cnt.keys()].sort((a,b)=>a-b).map(String);
  const data = labels.map(l => {
    const d = Number(l);
    return Math.round(((sum.get(d) || 0) / (cnt.get(d) || 1)) * 100) / 100;
  });
  return { labels, data, title: 'Average guesses per day (solves only)', yLabel: 'Avg guesses' };
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

function setStatus(el, msg, kind) {
  el.className = 'status ' + (kind || '');
  el.innerHTML = msg;
}

// -----------------------------
// Main actions
// -----------------------------
function onCsvLoaded(rows, columns, sourceName) {
  rawRows = rows;
  rawColumns = columns;
  normalizedWordle = [];

  const wordle = looksLikeWordleSummary(columns);
  setMode(wordle ? 'wordle' : 'generic');

  setStatus($('loadStatus'), `Loaded <strong>${rows.length}</strong> rows, <strong>${columns.length}</strong> columns from <strong>${escapeHtml(sourceName)}</strong>.`, 'ok');

  if (wordle) {
    normalizedWordle = normalizeWordle(rows);
    updateLastDaysDefault(rows.length);
    const players = uniq(normalizedWordle.map(r => r.player)).length;
    setStatus(
      $('chartStatus'),
      `Detected Wordle summary format. Normalized to <strong>${normalizedWordle.length}</strong> player-day rows across <strong>${players}</strong> unique players. Pick a preset and hit <strong>Render</strong>.`,
      'ok'
    );
  } else {
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

    const { data: limitedWordle, limit: dayLimit, maxDay } = getWordleLastDaysSubset();
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
      `Rendered preset: <strong>${escapeHtml(preset)}</strong> (last <strong>${dayLimit}</strong> of <strong>${maxDay}</strong> day${maxDay === 1 ? '' : 's'}).`,
      ''
    );
    const previewSlice = filteredRows.slice(Math.max(0, filteredRows.length - dayLimit));
    renderPreview(previewSlice, rawColumns);
    return;
  }

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
  // A tiny sample mimicking your Wordle summary CSV shape.
  const sample = `day streak,ðŸ‘‘ Round,ðŸ‘‘,1/6,2/6,3/6,4/6,5/6,6/6,X/6\n"**Your group is on a 1 day streak!**","1/6","@theBestLoser","@theBestLoser","--","@NotMajorPerson","@mediocreplant","@AsA @hereisrachel","--","@sinfulprey @eplex"\n"**Your group is on a 2 day streak!**","3/6","@AsA","--","--","@AsA","@hereisrachel","@Cesh","@MajorDanger","@mediocreplant @sinfulprey"`;
  parseCsvText(sample, 'built-in sample');
});

$('btnRender').addEventListener('click', render);
$('btnExport').addEventListener('click', exportNormalized);
$('btnClear').addEventListener('click', clearAll);

// initialize
clearAll();
