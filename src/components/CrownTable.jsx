export function CrownTable({
  rows,
  selectedPlayer,
  onSelectPlayer,
  panelHtml,
  emptyMessage,
  panelRef,
  onPanelClick,
  onPanelKeyDown
}) {
  const hasRows = rows.length > 0;

  return (
    <div className={`crownTable${hasRows ? ' crownTable--visible' : ''}`}>
      {!hasRows ? (
        <div className="status">{emptyMessage}</div>
      ) : (
        <>
          <div className="crownTable__heading">👑 Wins Leaderboard</div>
          <div className="crownTable__layout">
            <div className="crownTable__leaderboard">
              <table>
                <thead>
                  <tr>
                    <th>Place</th>
                    <th>User Name</th>
                    <th>Total Crown Wins</th>
                    <th>Crown %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const ratioPct = (row.ratio * 100).toFixed(1);
                    const isActive = selectedPlayer === row.player;

                    return (
                      <tr
                        key={row.player}
                        className={`crownTable__row${isActive ? ' crownTable__row--active' : ''}`}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isActive}
                        onClick={() => onSelectPlayer(row.player)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          onSelectPlayer(row.player);
                        }}
                      >
                        <td>{row.place}</td>
                        <td>
                          <span className="crownTable__name">{row.player}</span>
                        </td>
                        <td>{row.winCount}</td>
                        <td>{ratioPct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              ref={panelRef}
              className="crownTable__panel"
              id="crownTablePanel"
              onClick={onPanelClick}
              onKeyDown={onPanelKeyDown}
            >
              <div dangerouslySetInnerHTML={{ __html: panelHtml }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
