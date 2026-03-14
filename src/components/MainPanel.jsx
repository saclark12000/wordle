export function MainPanel({
  rows,
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
        <div className="crownTable__layout">
          <div
            ref={panelRef}
            className="crownTable__panel crownTable__panel--full"
            id="crownTablePanel"
            onClick={onPanelClick}
            onKeyDown={onPanelKeyDown}
          >
            <div dangerouslySetInnerHTML={{ __html: panelHtml }} />
          </div>
        </div>
      )}
    </div>
  );
}
