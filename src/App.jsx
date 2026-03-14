import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { CrownTable } from './components/CrownTable';
import { ControlPanel } from './components/ControlPanel';
import { PreviewTable } from './components/PreviewTable';
import { StatusMessage } from './components/StatusMessage';
import { BUILT_IN_SAMPLE, DEFAULT_CSV_PATH, DEVELOPER_DOC_FILES } from './lib/constants';
import { loadUtf8Text, parseCsvDocument } from './lib/csv-utils';
import { BadgeSystem, CrownWinsCore, GroupStats } from './lib/legacyModules';
import {
  buildDayEntries,
  buildNormalizedCsvText,
  buildPlayerStatsMarkup,
  collapseBadgeExpansion,
  computePlayerInsights,
  downloadText,
  escapeHtml,
  expandEarnedBadgeById,
  getLastDaysWindow,
  renderSimpleMarkdown,
  sanitizeLastDays,
  sanitizeLeaderboardLimit,
  toggleBadgeExpansion
} from './lib/ui-utils';
import './app.css';

const EMPTY_STATUS = { html: '', kind: '' };
const DEFAULT_DEVTOOLS_STATUS = { html: 'Logs appear in browser developer console.', kind: '' };
const TITLE_SECRET_TAP_TARGET = 5;
const TITLE_SECRET_RESET_MS = 2200;
const SECRET_STATUS_DURATION_MS = 4800;
const SECRET_VISUAL_DURATION_MS = 7000;
const SECRET_WORD = 'crown';
const SECRET_CROWN_TOKENS = [
  { label: '👑', kind: 'crown', top: 16, right: 8, drift: -16, lift: 86, rotateStart: -18, rotateEnd: 20, duration: 1720, delay: 0 },
  { label: '✨', kind: 'spark', top: 56, right: 22, drift: -42, lift: 108, rotateStart: -4, rotateEnd: 32, duration: 1460, delay: 80 },
  { label: '👑', kind: 'crown', top: 34, right: 48, drift: -26, lift: 118, rotateStart: -10, rotateEnd: 18, duration: 1680, delay: 140 },
  { label: '✦', kind: 'spark', top: 76, right: 66, drift: -58, lift: 96, rotateStart: 0, rotateEnd: 26, duration: 1520, delay: 210 },
  { label: '👑', kind: 'crown', top: 14, right: 92, drift: -20, lift: 92, rotateStart: -16, rotateEnd: 16, duration: 1640, delay: 270 },
  { label: '✨', kind: 'spark', top: 44, right: 112, drift: -46, lift: 126, rotateStart: -6, rotateEnd: 30, duration: 1500, delay: 330 },
  { label: '👑', kind: 'crown', top: 82, right: 132, drift: -38, lift: 104, rotateStart: -12, rotateEnd: 14, duration: 1700, delay: 390 },
  { label: '✦', kind: 'spark', top: 18, right: 156, drift: -30, lift: 88, rotateStart: 4, rotateEnd: 28, duration: 1480, delay: 450 },
  { label: '👑', kind: 'crown', top: 58, right: 178, drift: -54, lift: 112, rotateStart: -14, rotateEnd: 22, duration: 1740, delay: 510 },
  { label: '✨', kind: 'spark', top: 10, right: 202, drift: -36, lift: 98, rotateStart: -8, rotateEnd: 26, duration: 1500, delay: 570 },
  { label: '👑', kind: 'crown', top: 88, right: 224, drift: -60, lift: 130, rotateStart: -10, rotateEnd: 18, duration: 1820, delay: 640 },
  { label: '✦', kind: 'spark', top: 38, right: 248, drift: -44, lift: 92, rotateStart: 2, rotateEnd: 22, duration: 1460, delay: 710 }
];
const SECRET_WORDPLAY_TOKENS = [
  { label: 'C', kind: 'word', top: 18, right: 180, drift: -8, lift: 40, rotateStart: -6, rotateEnd: 4, duration: 1100, delay: 0 },
  { label: 'R', kind: 'word', top: 18, right: 146, drift: -4, lift: 48, rotateStart: -4, rotateEnd: 2, duration: 1100, delay: 60 },
  { label: 'O', kind: 'word', top: 18, right: 112, drift: 0, lift: 44, rotateStart: -2, rotateEnd: 1, duration: 1100, delay: 120 },
  { label: 'W', kind: 'word', top: 18, right: 74, drift: 4, lift: 48, rotateStart: 2, rotateEnd: -2, duration: 1100, delay: 180 },
  { label: 'N', kind: 'word', top: 18, right: 40, drift: 8, lift: 42, rotateStart: 4, rotateEnd: -4, duration: 1100, delay: 240 },
  { label: '🟩', kind: 'tile', top: 72, right: 152, drift: -12, lift: 24, rotateStart: -4, rotateEnd: 2, duration: 1200, delay: 100 },
  { label: '⬛', kind: 'tile', top: 72, right: 114, drift: -6, lift: 28, rotateStart: -2, rotateEnd: 2, duration: 1200, delay: 160 },
  { label: '🟨', kind: 'tile', top: 72, right: 76, drift: 6, lift: 26, rotateStart: 2, rotateEnd: -2, duration: 1200, delay: 220 }
];

function toStatus(html, kind = '') {
  return { html, kind };
}

function isTextEntryTarget(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export default function App() {
  const developerMode = useMemo(
    () => new URLSearchParams(window.location.search).get('developer') === 'true',
    []
  );
  const panelRef = useRef(null);
  const keyBufferRef = useRef('');
  const titleTapTimerRef = useRef(0);
  const whimsyTimerRef = useRef(0);
  const visualTimerRef = useRef(0);

  const [rawRows, setRawRows] = useState([]);
  const [rawColumns, setRawColumns] = useState([]);
  const [normalizedRows, setNormalizedRows] = useState([]);
  const [wordleDetected, setWordleDetected] = useState(false);
  const [pendingLimit, setPendingLimit] = useState('25');
  const [pendingLastDays, setPendingLastDays] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ limit: 25, lastDays: 0 });
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [activeGroupStatsId, setActiveGroupStatsId] = useState(
    GroupStats.DEFAULT_GROUP_STATS_LEADERBOARD_ID
  );
  const [loadStatus, setLoadStatus] = useState(toStatus('No CSV loaded.'));
  const [leaderboardStatus, setLeaderboardStatus] = useState(EMPTY_STATUS);
  const [whimsyStatus, setWhimsyStatus] = useState(EMPTY_STATUS);
  const [devToolsStatus, setDevToolsStatus] = useState(DEFAULT_DEVTOOLS_STATUS);
  const [developerDocs, setDeveloperDocs] = useState({
    loading: developerMode,
    entries: []
  });
  const [titleTapCount, setTitleTapCount] = useState(0);
  const [activeEasterEgg, setActiveEasterEgg] = useState('');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('developer-mode', developerMode);
    return () => {
      document.body.classList.remove('developer-mode');
    };
  }, [developerMode]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => () => {
    window.clearTimeout(titleTapTimerRef.current);
    window.clearTimeout(whimsyTimerRef.current);
    window.clearTimeout(visualTimerRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDocs() {
      if (!developerMode) {
        setDeveloperDocs({ loading: false, entries: [] });
        return;
      }

      setDeveloperDocs({ loading: true, entries: [] });
      const results = await Promise.all(
        DEVELOPER_DOC_FILES.map(async (doc) => {
          try {
            const content = await loadUtf8Text(doc.path);
            return {
              ...doc,
              html: renderSimpleMarkdown(content),
              error: null
            };
          } catch (error) {
            return {
              ...doc,
              html: '',
              error
            };
          }
        })
      );

      if (!cancelled) {
        setDeveloperDocs({ loading: false, entries: results });
      }
    }

    loadDocs();

    return () => {
      cancelled = true;
    };
  }, [developerMode]);

  useEffect(() => {
    let cancelled = false;

    async function loadDefaultCsv() {
      try {
        const csvText = await loadUtf8Text(DEFAULT_CSV_PATH);
        if (!cancelled) {
          handleCsvText(csvText, DEFAULT_CSV_PATH);
        }
      } catch (error) {
        console.error('Failed to load default CSV', error);
        if (!cancelled) {
          setLoadStatus(
            toStatus(
              `Failed to load default CSV (${escapeHtml(DEFAULT_CSV_PATH)}). Use the file picker instead.`,
              'warn'
            )
          );
        }
      }
    }

    loadDefaultCsv();

    return () => {
      cancelled = true;
    };
  }, []);

  const totalDays = useMemo(() => buildDayEntries(normalizedRows).length, [normalizedRows]);

  const windowMeta = useMemo(
    () => getLastDaysWindow(normalizedRows, appliedFilters.lastDays),
    [normalizedRows, appliedFilters.lastDays]
  );

  const leaderboardLimit = useMemo(
    () => sanitizeLeaderboardLimit(appliedFilters.limit, 25),
    [appliedFilters.limit]
  );

  const playerMetricsMap = useMemo(
    () => BadgeSystem.buildPlayerMetricsMap(windowMeta.data),
    [windowMeta.data]
  );

  const leaderboardRows = useMemo(() => {
    if (!windowMeta.data.length) {
      const emptyRows = [];
      emptyRows.rankings = BadgeSystem.buildLeaderboardRankings(playerMetricsMap);
      return emptyRows;
    }
    const rows = CrownWinsCore.wordleCrownWins(windowMeta.data, leaderboardLimit);
    rows.rankings = BadgeSystem.buildLeaderboardRankings(playerMetricsMap);
    return rows;
  }, [windowMeta.data, leaderboardLimit, playerMetricsMap]);

  const previewRows = useMemo(() => {
    if (!windowMeta.data.length) return [];
    if (windowMeta.selectedRowIndexes.size) {
      return rawRows.filter((row) => windowMeta.selectedRowIndexes.has(row.__rowIndex));
    }
    return rawRows.slice(Math.max(0, rawRows.length - windowMeta.limit));
  }, [rawRows, windowMeta]);

  const crownContext = useMemo(() => {
    const context = BadgeSystem.createCrownContext();
    context.leaderboard = leaderboardRows;
    context.dataset = windowMeta.data;
    context.selectedPlayer = selectedPlayer;
    context.groupStats = {
      activeLeaderboardId: activeGroupStatsId
    };
    context.playerMetrics = playerMetricsMap;
    context.badgeMetricSources = {
      custom: {}
    };
    context.windowMeta = windowMeta;
    context.windowDays = windowMeta.limit || 0;
    return context;
  }, [activeGroupStatsId, leaderboardRows, playerMetricsMap, selectedPlayer, windowMeta]);

  const groupStatsData = useMemo(
    () => (windowMeta.data.length ? GroupStats.deriveGroupStatsData(windowMeta.data) : null),
    [windowMeta.data]
  );

  const panelHtml = useMemo(() => {
    if (!wordleDetected || !windowMeta.data.length) {
      return '<div class="status">Load a Wordle CSV to see group stats.</div>';
    }

    if (!selectedPlayer) {
      return GroupStats.buildGroupStatsPanelMarkup(groupStatsData, {
        activeLeaderboardId: activeGroupStatsId,
        callouts: GroupStats.deriveGroupStatsCallouts(groupStatsData)
      });
    }

    const metrics = BadgeSystem.getPlayerMetrics(crownContext, selectedPlayer);
    const playerRows = windowMeta.data.filter((row) => row.player === selectedPlayer);
    const insights = computePlayerInsights(metrics, {
      windowDays: crownContext.windowDays,
      rows: playerRows.length ? playerRows : metrics.rows
    });
    const badges = BadgeSystem.resolvePlayerCardBadges(crownContext, selectedPlayer, {
      windowDays: crownContext.windowDays,
      metricSources: {
        insights
      }
    });
    const badgeMarkup = badges.length ? BadgeSystem.buildPlayerBadgesMarkup(badges) : '';
    const roundBreakdownBadges = BadgeSystem.buildRoundBreakdownBadgeMap(badges);

    return buildPlayerStatsMarkup(
      selectedPlayer,
      metrics,
      badgeMarkup,
      roundBreakdownBadges
    );
  }, [activeGroupStatsId, crownContext, groupStatsData, selectedPlayer, windowMeta.data, wordleDetected]);

  const secretTokens = activeEasterEgg === 'crowns'
    ? SECRET_CROWN_TOKENS
    : activeEasterEgg === 'wordplay'
      ? SECRET_WORDPLAY_TOKENS
      : [];

  useEffect(() => {
    if (selectedPlayer && !playerMetricsMap.has(selectedPlayer)) {
      setSelectedPlayer(null);
    }
  }, [playerMetricsMap, selectedPlayer]);

  useEffect(() => {
    window.clearTimeout(titleTapTimerRef.current);
    if (!titleTapCount) return undefined;
    titleTapTimerRef.current = window.setTimeout(() => {
      setTitleTapCount(0);
    }, TITLE_SECRET_RESET_MS);
    return () => {
      window.clearTimeout(titleTapTimerRef.current);
    };
  }, [titleTapCount]);

  function showWhimsyStatus(html) {
    setWhimsyStatus(toStatus(html, 'ok'));
    window.clearTimeout(whimsyTimerRef.current);
    whimsyTimerRef.current = window.setTimeout(() => {
      setWhimsyStatus(EMPTY_STATUS);
    }, SECRET_STATUS_DURATION_MS);
  }

  function activateEasterEgg(mode, html) {
    setActiveEasterEgg(mode);
    showWhimsyStatus(html);
    window.clearTimeout(visualTimerRef.current);
    visualTimerRef.current = window.setTimeout(() => {
      setActiveEasterEgg('');
    }, SECRET_VISUAL_DURATION_MS);
  }

  useEffect(() => {
    function handleSecretKeydown(event) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTextEntryTarget(event.target)) return;
      const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
      if (!/^[a-z]$/.test(key)) return;

      keyBufferRef.current = `${keyBufferRef.current}${key}`.slice(-SECRET_WORD.length);
      if (keyBufferRef.current !== SECRET_WORD) return;

      keyBufferRef.current = '';
      activateEasterEgg(
        'wordplay',
        prefersReducedMotion
          ? 'Secret phrase found. Quiet wordplay mode is active for a few seconds.'
          : 'Secret phrase found. Wordplay mode is active for a few seconds.'
      );
    }

    document.addEventListener('keydown', handleSecretKeydown);
    return () => {
      document.removeEventListener('keydown', handleSecretKeydown);
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (!rawRows.length) {
      setLeaderboardStatus(EMPTY_STATUS);
      return;
    }

    if (!wordleDetected) {
      setLeaderboardStatus(
        toStatus(
          'CSV loaded, but the expected Wordle columns (1/6 through X/6 plus crown data) were not found.',
          'warn'
        )
      );
      return;
    }

    if (!windowMeta.data.length) {
      setLeaderboardStatus(toStatus('No rows available for the requested day window.', 'warn'));
      return;
    }

    const latestCopy = windowMeta.latestLabel
      ? ` Latest day: <strong>${escapeHtml(windowMeta.latestLabel)}</strong>.`
      : '';
    const devLinkCopy = developerMode
      ? ''
      : ' See <a href="?developer=true">?developer=true</a> for developer docs.';
    const baseCopy = `Rendered Crown Wins leaderboard for the last <strong>${windowMeta.limit}</strong> day(s) covering <strong>${windowMeta.rowCount || windowMeta.data.length}</strong> CSV rows.`;

    setLeaderboardStatus(toStatus(baseCopy + latestCopy + devLinkCopy, leaderboardRows.length ? 'ok' : 'warn'));
  }, [developerMode, leaderboardRows.length, rawRows.length, windowMeta, wordleDetected]);

  function resetData() {
    startTransition(() => {
      setRawRows([]);
      setRawColumns([]);
      setNormalizedRows([]);
      setWordleDetected(false);
      setPendingLimit('25');
      setPendingLastDays('');
      setAppliedFilters({ limit: 25, lastDays: 0 });
      setSelectedPlayer(null);
      setActiveGroupStatsId(GroupStats.DEFAULT_GROUP_STATS_LEADERBOARD_ID);
    });
  }

  function handleCsvText(text, sourceName) {
    const { rows, columns, errors } = parseCsvDocument(text);
    if (errors.length) {
      console.warn(errors);
    }

    if (!rows.length) {
      resetData();
      setLoadStatus(toStatus('CSV parsed but found zero data rows.', 'warn'));
      setLeaderboardStatus(EMPTY_STATUS);
      return;
    }

    const looksLikeWordle = CrownWinsCore.looksLikeWordleSummary(columns);
    const normalized = looksLikeWordle
      ? CrownWinsCore.normalizeWordle(rows, CrownWinsCore.detectDateField(columns))
      : [];
    const defaultWindow = looksLikeWordle ? buildDayEntries(normalized).length : 0;
    const uniquePlayers = new Set(normalized.map((row) => row.player)).size;

    startTransition(() => {
      setRawRows(rows);
      setRawColumns(columns);
      setNormalizedRows(normalized);
      setWordleDetected(looksLikeWordle);
      setPendingLimit('25');
      setPendingLastDays(defaultWindow ? String(defaultWindow) : '');
      setAppliedFilters({ limit: 25, lastDays: defaultWindow });
      setSelectedPlayer(null);
      setActiveGroupStatsId(GroupStats.DEFAULT_GROUP_STATS_LEADERBOARD_ID);
    });

    setLoadStatus(
      toStatus(
        `Loaded <strong>${rows.length}</strong> rows, <strong>${columns.length}</strong> columns from <strong>${escapeHtml(sourceName)}</strong>.`,
        'ok'
      )
    );

    if (looksLikeWordle) {
      setLeaderboardStatus(
        toStatus(
          `Detected Wordle summary format. Normalized to <strong>${normalized.length}</strong> player-day rows across <strong>${uniquePlayers}</strong> unique players.`,
          'ok'
        )
      );
    } else {
      setLeaderboardStatus(
        toStatus(
          'CSV loaded, but the expected Wordle columns (1/6 through X/6 plus crown data) were not found.',
          'warn'
        )
      );
    }

    setDevToolsStatus(DEFAULT_DEVTOOLS_STATUS);
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    const text = await file.text();
    handleCsvText(text, file.name);
  }

  function handleLoadSample() {
    handleCsvText(BUILT_IN_SAMPLE, 'built-in sample');
  }

  function handleRender() {
    if (!wordleDetected || !normalizedRows.length) {
      setLeaderboardStatus(toStatus('Load a Wordle CSV first.', 'warn'));
      return;
    }

    const nextLimit = sanitizeLeaderboardLimit(Number(pendingLimit), 25);
    const nextLastDays = sanitizeLastDays(Number(pendingLastDays), totalDays);

    setPendingLimit(String(nextLimit));
    setPendingLastDays(nextLastDays ? String(nextLastDays) : '');
    startTransition(() => {
      setAppliedFilters({ limit: nextLimit, lastDays: nextLastDays });
      setSelectedPlayer(null);
    });
  }

  function handleExport() {
    if (!wordleDetected || !normalizedRows.length) {
      setLeaderboardStatus(toStatus('Nothing to export (Wordle format not detected).', 'warn'));
      return;
    }

    downloadText('normalized_wordle.csv', buildNormalizedCsvText(normalizedRows));
    setLeaderboardStatus(toStatus('Exported normalized_wordle.csv', 'ok'));
  }

  function handleClear() {
    resetData();
    setLoadStatus(toStatus('No CSV loaded.'));
    setLeaderboardStatus(EMPTY_STATUS);
    setWhimsyStatus(EMPTY_STATUS);
    setDevToolsStatus(DEFAULT_DEVTOOLS_STATUS);
  }

  function handleSelectPlayer(player) {
    setSelectedPlayer(player);
  }

  function handleTitleSecret() {
    setTitleTapCount((current) => {
      const nextCount = current + 1;
      if (nextCount < TITLE_SECRET_TAP_TARGET) {
        return nextCount;
      }

      activateEasterEgg(
        'crowns',
        prefersReducedMotion
          ? 'Secret found. The crown offered a respectful nod.'
          : 'Secret found. Tiny crown parade activated for a few seconds.'
      );
      return 0;
    });
  }

  function handlePanelClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const navButton = target.closest('[data-group-stats-leaderboard]');
    if (navButton) {
      const nextId = navButton.getAttribute('data-group-stats-leaderboard') || '';
      if (!GroupStats.isGroupStatsLeaderboardId(nextId)) return;
      setSelectedPlayer(null);
      setActiveGroupStatsId(nextId);
      return;
    }

    const playerRow = target.closest('[data-group-stats-player-row]');
    if (playerRow) {
      const player = decodeURIComponent(playerRow.getAttribute('data-group-stats-player-row') || '');
      if (!player) return;
      setSelectedPlayer(player);
      return;
    }

    const badgeClose = target.closest('[data-player-badge-close]');
    if (badgeClose) {
      collapseBadgeExpansion(badgeClose.closest('[data-player-badge]'));
      return;
    }

    const roundBadge = target.closest('[data-round-badge-id]');
    if (roundBadge) {
      expandEarnedBadgeById(roundBadge.getAttribute('data-round-badge-id') || '', panelRef.current);
      return;
    }

    const groupPanelButton = target.closest('[data-crown-group-panel]');
    if (groupPanelButton) {
      setSelectedPlayer(null);
      return;
    }

    const badge = target.closest('[data-player-badge]');
    if (badge && !badge.classList.contains('playerCard__badge--expanded')) {
      toggleBadgeExpansion(badge);
    }
  }

  function handlePanelKeyDown(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const playerRow = target.closest('[data-group-stats-player-row]');
    if (playerRow && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      const player = decodeURIComponent(playerRow.getAttribute('data-group-stats-player-row') || '');
      if (!player) return;
      setSelectedPlayer(player);
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (target.closest('[data-player-badge-close]')) return;
    const badge = target.closest('[data-player-badge]');
    if (!badge) return;
    event.preventDefault();
    toggleBadgeExpansion(badge);
  }

  function handleLogBadgeContext() {
    if (!developerMode) {
      setDevToolsStatus(toStatus('Enable developer mode to use ctx logging.', 'warn'));
      return;
    }

    if (!wordleDetected || !windowMeta.data.length) {
      setDevToolsStatus(toStatus('Load and render Wordle data before logging ctx.', 'warn'));
      console.warn('[Developer] Cannot log badge ctx: no active dataset.');
      return;
    }

    const selected =
      selectedPlayer ||
      (Array.isArray(crownContext.leaderboard) && crownContext.leaderboard[0]
        ? crownContext.leaderboard[0].player
        : null);

    const overview = {
      timestamp: new Date().toISOString(),
      selectedPlayer: selected,
      datasetRows: crownContext.dataset.length,
      leaderboardRows: Array.isArray(crownContext.leaderboard) ? crownContext.leaderboard.length : 0,
      subsetDays: windowMeta.limit,
      subsetRows: windowMeta.data.length,
      latestLabel: windowMeta.latestLabel || ''
    };

    if (!selected) {
      console.groupCollapsed('[Developer] badge ctx snapshot (no selected player)');
      console.log('Overview', overview);
      console.log('Crown context', crownContext);
      console.groupEnd();
      setDevToolsStatus(
        toStatus('Logged context without a selected player. Select a player row for full badge ctx.', 'ok')
      );
      return;
    }

    const metrics = BadgeSystem.getPlayerMetrics(crownContext, selected);
    const playerRows = windowMeta.data.filter((row) => row.player === selected);
    const insights = computePlayerInsights(metrics, {
      windowDays: crownContext.windowDays,
      rows: playerRows.length ? playerRows : metrics.rows
    });
    const metricSources = { insights };
    const badgeContext = BadgeSystem.buildBadgeContext(crownContext, selected, {
      windowDays: crownContext.windowDays,
      metricSources
    });
    const summary = BadgeSystem.summarizeBadgeContextForDebug(badgeContext, {
      maxLeaderboard: 10,
      maxRows: 8
    });
    const badges = BadgeSystem.resolvePlayerCardBadges(crownContext, selected, {
      windowDays: crownContext.windowDays,
      metricSources
    });

    console.groupCollapsed(`[Developer] badge ctx snapshot: ${selected}`);
    console.log('Overview', overview);
    console.log('Badge context summary', summary);
    console.log('Badge context (raw)', badgeContext);
    console.table(
      badges.map((badge) => ({
        id: badge.id,
        earned: badge.earned !== false,
        progress: badge.progress || '',
        requirement: badge.requirement || ''
      }))
    );
    console.groupEnd();

    setDevToolsStatus(toStatus(`Logged badge ctx snapshot for ${escapeHtml(selected)}.`, 'ok'));
  }

  const emptyTableMessage = !rawRows.length
    ? 'Loading leaderboard...'
    : wordleDetected
      ? 'No Crown Wins detected.'
      : 'Load a Wordle CSV to see the leaderboard.';

  return (
    <div className="appShell">

      <main className="grid">
        <ControlPanel
          developerMode={developerMode}
          pendingLimit={pendingLimit}
          pendingLastDays={pendingLastDays}
          onLimitChange={(event) => setPendingLimit(event.target.value)}
          onLastDaysChange={(event) => setPendingLastDays(event.target.value)}
          onFileChange={handleFileChange}
          onLoadSample={handleLoadSample}
          onRender={handleRender}
          onExport={handleExport}
          onClear={handleClear}
          onLogBadgeContext={handleLogBadgeContext}
          loadStatus={loadStatus}
          devToolsStatus={devToolsStatus}
          docs={developerDocs}
          exportDisabled={!wordleDetected}
          lastDaysDisabled={!wordleDetected}
        />

        <section className={`card workspaceCard${activeEasterEgg ? ` workspaceCard--egg workspaceCard--egg-${activeEasterEgg}` : ''}`}>
          <div className="workspaceCard__header">
            <div>
              <h1 className="workspaceCard__title">
                <button
                  id="pageTitle"
                  type="button"
                  className="pageTitleButton"
                  onClick={handleTitleSecret}
                  aria-label={`# wordle-hurdle. Hidden surprise after ${TITLE_SECRET_TAP_TARGET} taps.`}
                >
                  <span className="pageTitleButton__text"># wordle-hurdle</span>
                </button>
              </h1>
            </div>
            <div className={`workspaceCard__secretStage workspaceCard__secretStage--${activeEasterEgg || 'idle'}`} aria-hidden="true">
              {secretTokens.map((token, index) => (
                <span
                  key={`${activeEasterEgg || 'idle'}-${token.label}-${index}`}
                  className={`workspaceCard__secretToken workspaceCard__secretToken--${token.kind}`}
                  style={{
                    '--token-delay': `${token.delay}ms`,
                    '--token-duration': `${token.duration}ms`,
                    '--token-drift': `${token.drift}px`,
                    '--token-lift': `${token.lift}px`,
                    '--token-right': `${token.right}px`,
                    '--token-rotate-end': `${token.rotateEnd}deg`,
                    '--token-rotate-start': `${token.rotateStart}deg`,
                    '--token-top': `${token.top}px`
                  }}
                >
                  {token.label}
                </span>
              ))}
            </div>
          </div>
          <StatusMessage status={whimsyStatus} className="workspaceCard__whimsyStatus" />

          <div className="canvasWrap">
            <CrownTable
              rows={leaderboardRows}
              panelHtml={panelHtml}
              emptyMessage={emptyTableMessage}
              panelRef={panelRef}
              onPanelClick={handlePanelClick}
              onPanelKeyDown={handlePanelKeyDown}
            />
          </div>
          <StatusMessage status={leaderboardStatus} />

          <div className="divider"></div>

          <div className="workspaceCard__previewHeader">
            <div>
              <h2>Data preview</h2>
              <div className="small">Rows from the uploaded CSV that feed the current leaderboard window.</div>
            </div>
          </div>
          <PreviewTable rows={previewRows} columns={rawColumns} />
        </section>
      </main>
    </div>
  );
}
