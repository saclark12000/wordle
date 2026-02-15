(function (global) {
  const CrownWinsCore = global.CrownWinsCore || {};
  const { getDayValueFromRow } = CrownWinsCore;

  if (typeof getDayValueFromRow !== 'function') {
    throw new Error('CrownState requires CrownWinsCore.getDayValueFromRow.');
  }

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return value;
    return Math.min(max, Math.max(min, value));
  }

  function buildDayEntry(row) {
    const key = row.dayKey || String(row.dayIndex);
    return {
      key,
      label: row.dayLabel || `Day ${row.dayIndex}`,
      value: getDayValueFromRow(row),
      rowIndex: typeof row.sourceRowIndex === 'number' ? row.sourceRowIndex : null
    };
  }

  function createStateStore() {
    const state = {
      rawRows: [],
      rawColumns: [],
      normalizedWordle: [],
      filters: {
        lastDays: 0,
        leaderboardLimit: 25
      },
      dataVersion: 0
    };

    const memo = {
      dayEntries: null,
      lastDaysSubset: null,
      playerRows: new Map()
    };

    function resetMemo() {
      memo.dayEntries = null;
      memo.lastDaysSubset = null;
      memo.playerRows.clear();
    }

    function reset() {
      state.rawRows = [];
      state.rawColumns = [];
      state.normalizedWordle = [];
      state.filters.lastDays = 0;
      state.filters.leaderboardLimit = 25;
      state.dataVersion += 1;
      resetMemo();
    }

    function setRawData(rows, columns) {
      state.rawRows = Array.isArray(rows) ? rows : [];
      state.rawColumns = Array.isArray(columns) ? columns : [];
    }

    function setNormalizedWordle(rows) {
      state.normalizedWordle = Array.isArray(rows) ? rows : [];
      state.dataVersion += 1;
      resetMemo();
    }

    function getNormalizedWordle() {
      return state.normalizedWordle;
    }

    function getRawRows() {
      return state.rawRows;
    }

    function getRawColumns() {
      return state.rawColumns;
    }

    function setLeaderboardLimit(value) {
      let numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        numeric = state.filters.leaderboardLimit || 25;
      }
      const sanitized = clamp(Math.floor(numeric), 3, 50);
      state.filters.leaderboardLimit = sanitized;
      return sanitized;
    }

    function getLeaderboardLimit() {
      return state.filters.leaderboardLimit;
    }

    function getDayEntries() {
      if (memo.dayEntries && memo.dayEntries.version === state.dataVersion) {
        return memo.dayEntries.value;
      }
      const seen = new Map();
      for (const row of state.normalizedWordle) {
        if (!row) continue;
        const key = row.dayKey || String(row.dayIndex);
        if (!seen.has(key)) {
          seen.set(key, buildDayEntry(row));
        }
      }
      const value = [...seen.values()].sort((a, b) => a.value - b.value);
      memo.dayEntries = { version: state.dataVersion, value };
      return value;
    }

    function getTotalDays() {
      return getDayEntries().length;
    }

    function setLastDays(requested) {
      const totalDays = getTotalDays();
      let sanitized = Number(requested);
      if (!Number.isFinite(sanitized) || sanitized <= 0) {
        sanitized = totalDays || 0;
      }
      if (totalDays) {
        sanitized = clamp(Math.floor(sanitized), 1, totalDays);
      } else {
        sanitized = 0;
      }
      state.filters.lastDays = sanitized;
      memo.lastDaysSubset = null;
      memo.playerRows.clear();
      return sanitized;
    }

    function getLastDaysFilter() {
      return state.filters.lastDays;
    }

    function getLastDaysSubset() {
      const dayEntries = getDayEntries();
      const totalDays = dayEntries.length;
      const windowDays = totalDays ? (state.filters.lastDays || totalDays) : 0;
      const subsetKey = `${state.dataVersion}:${windowDays}:${totalDays}`;
      if (memo.lastDaysSubset && memo.lastDaysSubset.key === subsetKey) {
        return memo.lastDaysSubset.value;
      }
      if (!totalDays) {
        const empty = {
          data: [],
          limit: 0,
          maxDays: 0,
          selectedDayKeys: new Set(),
          selectedRowIndexes: new Set(),
          latestLabel: '',
          rowCount: 0
        };
        memo.lastDaysSubset = { key: subsetKey, value: empty };
        return empty;
      }
      const selectedEntries = dayEntries.slice(totalDays - windowDays);
      const selectedDayKeys = new Set(selectedEntries.map((d) => d.key));
      const selectedRowIndexes = new Set(
        selectedEntries.map((d) => d.rowIndex).filter((idx) => idx !== null && idx !== undefined)
      );
      const data = state.normalizedWordle.filter((row) => selectedDayKeys.has(row.dayKey || String(row.dayIndex)));
      const latestLabel = selectedEntries.length ? selectedEntries[selectedEntries.length - 1].label : '';
      const value = {
        data,
        limit: windowDays,
        maxDays: totalDays,
        selectedDayKeys,
        selectedRowIndexes,
        latestLabel,
        rowCount: selectedRowIndexes.size
      };
      memo.lastDaysSubset = { key: subsetKey, value };
      memo.playerRows.clear();
      return value;
    }

    function getPlayerRows(player) {
      if (!player) return [];
      const subset = getLastDaysSubset();
      const subsetKey = memo.lastDaysSubset ? memo.lastDaysSubset.key : 'none';
      const memoKey = `${player}:${subsetKey}`;
      if (memo.playerRows.has(memoKey)) {
        return memo.playerRows.get(memoKey);
      }
      const rows = subset.data.filter((row) => row.player === player);
      memo.playerRows.set(memoKey, rows);
      return rows;
    }

    function hasData() {
      return state.normalizedWordle.length > 0;
    }

    return {
      reset,
      setRawData,
      setNormalizedWordle,
      getNormalizedWordle,
      getRawRows,
      getRawColumns,
      getDayEntries,
      getTotalDays,
      setLastDays,
      getLastDaysFilter,
      getLastDaysSubset,
      getPlayerRows,
      setLeaderboardLimit,
      getLeaderboardLimit,
      hasData
    };
  }

  global.CrownState = {
    createStateStore
  };
})(typeof window !== 'undefined' ? window : globalThis);
