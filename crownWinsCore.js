(function (global) {
  const CROWN_COL_NAMES = ['👑', 'crown'];
  const CROWN_ROUND_COL_NAMES = ['👑 Round', 'crown round'];

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
    return s.split(/\s+/g).map(normalizeHandle).filter(Boolean);
  }

  function looksLikeWordleSummary(columns) {
    const needed = ['1/6', '2/6', '3/6', '4/6', '5/6', '6/6', 'X/6'];
    return needed.every((c) => columns.includes(c));
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

  function normalizeWordle(rows, dateField) {
    const out = [];
    const guessCols = ['1/6', '2/6', '3/6', '4/6', '5/6', '6/6', 'X/6'];

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

  function wordleCrownWins(norm, limit) {
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

  const api = {
    looksLikeWordleSummary,
    detectDateField,
    normalizeWordle,
    wordleCrownWins,
    splitHandles,
    deriveDayMeta,
    getDayValueFromRow
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.CrownWinsCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
