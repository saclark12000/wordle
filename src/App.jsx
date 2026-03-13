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

function toStatus(html, kind = '') {
  return { html, kind };
}

export default function App() {
  const developerMode = useMemo(
    () => new URLSearchParams(window.location.search).get('developer') === 'true',
    []
  );
  const panelRef = useRef(null);

  const [rawRows, setRawRows] = useState([]);
  const [rawColumns, setRawColumns] = useState([]);
  const [normalizedRows, setNormalizedRows] = useState([]);
  const [wordleDetected, setWordleDetected] = useState(false);
  const [dataSource, setDataSource] = useState('');
  const [pendingLimit, setPendingLimit] = useState('25');
  const [pendingLastDays, setPendingLastDays] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ limit: 25, lastDays: 0 });
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [activeGroupStatsId, setActiveGroupStatsId] = useState(
    GroupStats.DEFAULT_GROUP_STATS_LEADERBOARD_ID
  );
  const [loadStatus, setLoadStatus] = useState(toStatus('No CSV loaded.'));
  const [leaderboardStatus, setLeaderboardStatus] = useState(EMPTY_STATUS);
  const [devToolsStatus, setDevToolsStatus] = useState(DEFAULT_DEVTOOLS_STATUS);
  const [developerDocs, setDeveloperDocs] = useState({
    loading: developerMode,
    entries: []
  });

  useEffect(() => {
    document.body.classList.toggle('developer-mode', developerMode);
    return () => {
      document.body.classList.remove('developer-mode');
    };
  }, [developerMode]);

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

  useEffect(() => {
    if (selectedPlayer && !playerMetricsMap.has(selectedPlayer)) {
      setSelectedPlayer(null);
    }
  }, [playerMetricsMap, selectedPlayer]);

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
      setDataSource('');
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
      setDataSource(sourceName);
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
    setDevToolsStatus(DEFAULT_DEVTOOLS_STATUS);
  }

  function handleSelectPlayer(player) {
    setSelectedPlayer(player);
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
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
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

  const summaryStats = [
    {
      label: 'Source',
      value: dataSource || DEFAULT_CSV_PATH
    },
    {
      label: 'Days tracked',
      value: wordleDetected ? String(windowMeta.limit || totalDays || 0) : '--'
    },
    {
      label: 'Players',
      value: wordleDetected ? String(new Set(normalizedRows.map((row) => row.player)).size) : '--'
    },
    {
      label: 'Rows',
      value: wordleDetected ? String(windowMeta.data.length || 0) : String(rawRows.length || 0)
    }
  ];

  const emptyTableMessage = !rawRows.length
    ? 'Loading leaderboard...'
    : wordleDetected
      ? 'No Crown Wins detected.'
      : 'Load a Wordle CSV to see the leaderboard.';

  return (
    <div className="appShell">
      <header className="appHero">
        <div>
          <div className="appHero__eyebrow">React Frontend</div>
          <h1 id="pageTitle"># wordle-hurdle</h1>
          <p className="appHero__copy">
            Crown wins leaderboard, group stats, badge inspection, and normalized exports on top
            of the existing Wordle parsing and ranking logic.
          </p>
        </div>
        <div className="appHero__stats" aria-label="Dataset summary">
          {summaryStats.map((stat) => (
            <div key={stat.label} className="appHero__stat">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>
      </header>

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

        <section className="card workspaceCard">
          <div className="workspaceCard__header">
            <div>
              <div className="workspaceCard__eyebrow">Leaderboard Workspace</div>
              <h2>Current Window</h2>
            </div>
            <p className="workspaceCard__subcopy">
              Default sample data loads automatically. Open <code>?developer=true</code> for CSV
              upload controls and in-app docs.
            </p>
          </div>

          <div className="canvasWrap">
            <CrownTable
              rows={leaderboardRows}
              selectedPlayer={selectedPlayer}
              onSelectPlayer={handleSelectPlayer}
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
