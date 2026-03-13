import { DeveloperDocs } from './DeveloperDocs';
import { StatusMessage } from './StatusMessage';

export function ControlPanel({
  developerMode,
  pendingLimit,
  pendingLastDays,
  onLimitChange,
  onLastDaysChange,
  onFileChange,
  onLoadSample,
  onRender,
  onExport,
  onClear,
  onLogBadgeContext,
  loadStatus,
  devToolsStatus,
  docs,
  exportDisabled,
  lastDaysDisabled
}) {
  if (!developerMode) {
    return null;
  }

  return (
    <section className="card developerPanel controlCard">
      <div className="btnrow">
        <a className="crownTable__panelBtn" href="?developer=false" aria-label="Close developer panel">
          &times;
        </a>
      </div>

      <h2>Load CSV</h2>
      <input id="file" type="file" accept=".csv,text/csv" onChange={onFileChange} />
      <div className="btnrow">
        <button type="button" onClick={onLoadSample}>Load built-in sample</button>
        <button type="button" className="danger" onClick={onClear}>Clear</button>
      </div>
      <StatusMessage status={loadStatus} />

      <div className="divider"></div>

      <h2>Leaderboard Controls</h2>
      <label htmlFor="limit">Top N (leaderboard)</label>
      <input
        id="limit"
        type="number"
        min="3"
        max="50"
        value={pendingLimit}
        onChange={onLimitChange}
      />

      <label htmlFor="lastDays">Last N days</label>
      <input
        id="lastDays"
        type="number"
        min="1"
        placeholder="e.g. 30"
        value={pendingLastDays}
        onChange={onLastDaysChange}
        disabled={lastDaysDisabled}
      />

      <div className="btnrow">
        <button type="button" className="primary" onClick={onRender}>Render leaderboard</button>
        <button type="button" onClick={onExport} disabled={exportDisabled}>Export normalized CSV</button>
      </div>

      <div className="hint small">
        Only official Wordle/Hurdle CSV exports are supported.
      </div>

      <div className="divider"></div>

      <h2>Developer Tools</h2>
      <div className="btnrow">
        <button type="button" onClick={onLogBadgeContext}>Log current badge ctx</button>
      </div>
      <StatusMessage status={devToolsStatus} />

      <div className="divider"></div>

      <h2>Developer Docs</h2>
      <DeveloperDocs developerMode={developerMode} docs={docs} />
    </section>
  );
}
