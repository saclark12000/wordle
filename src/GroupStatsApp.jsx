import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CSV_PATH } from './lib/constants';
import { loadUtf8Text, parseCsvDocument } from './lib/csv-utils';
import { CrownWinsCore, GroupStats } from './lib/legacyModules';
import { buildDayEntries } from './lib/ui-utils';
import './app.css';

export default function GroupStatsApp() {
  const [activeLeaderboardId, setActiveLeaderboardId] = useState(
    GroupStats.DEFAULT_GROUP_STATS_LEADERBOARD_ID
  );
  const [normalizedRows, setNormalizedRows] = useState([]);
  const [status, setStatus] = useState('Loading sample data...');
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.classList.add('groupStatsStandalone');
    return () => {
      document.body.classList.remove('groupStatsStandalone');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadGroupStats() {
      try {
        const csvText = await loadUtf8Text(DEFAULT_CSV_PATH);
        const { rows, columns, errors } = parseCsvDocument(csvText);
        if (errors.length) {
          throw new Error(errors[0].message);
        }
        const dateField = CrownWinsCore.detectDateField(columns);
        const normalized = CrownWinsCore.normalizeWordle(rows, dateField);
        if (!cancelled) {
          setNormalizedRows(normalized);
          setStatus('Loaded group stats preview.');
          setError('');
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(String(loadError?.message || loadError));
          setStatus('Failed to load group stats preview.');
        }
      }
    }

    loadGroupStats();

    return () => {
      cancelled = true;
    };
  }, []);

  const groupStatsData = useMemo(
    () => (normalizedRows.length ? GroupStats.deriveGroupStatsData(normalizedRows) : null),
    [normalizedRows]
  );

  const metaCopy = useMemo(() => {
    const totalDays = buildDayEntries(normalizedRows).length;
    if (!groupStatsData) {
      return status;
    }
    return `Last ${totalDays} day(s) · Latest: ${groupStatsData.latestDate || 'n/a'}`;
  }, [groupStatsData, normalizedRows, status]);

  const panelHtml = useMemo(() => {
    if (!groupStatsData) {
      return error ? `<div class="status warn">${error}</div>` : '<div class="status">Loading sample data...</div>';
    }
    return GroupStats.buildGroupStatsPanelMarkup(groupStatsData, {
      title: 'Group Stats Preview',
      activeLeaderboardId,
      callouts: GroupStats.deriveGroupStatsCallouts(groupStatsData)
    });
  }, [activeLeaderboardId, error, groupStatsData]);

  return (
    <main className="groupStatsStandalone__main appStandalone">
      <header className="groupStatsStandalone__header appStandalone__header">
        <div className="appHero__eyebrow">Standalone View</div>
        <h1># wordle-hurdle</h1>
        <p>{metaCopy}</p>
      </header>
      <div
        className="card"
        onClick={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const navButton = target.closest('[data-group-stats-leaderboard]');
          if (!navButton) return;
          const requestedId = navButton.getAttribute('data-group-stats-leaderboard') || '';
          if (!GroupStats.isGroupStatsLeaderboardId(requestedId)) return;
          setActiveLeaderboardId(requestedId);
        }}
      >
        <div dangerouslySetInnerHTML={{ __html: panelHtml }} />
      </div>
    </main>
  );
}
