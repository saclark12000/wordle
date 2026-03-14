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
    <div className={`mainPanel${hasRows ? ' mainPanel--visible' : ''}`}>
      {!hasRows ? (
        <div className="status">{emptyMessage}</div>
      ) : (
        <div className="mainPanel__layout">
          <div
            ref={panelRef}
            className="mainPanel__surface mainPanel__surface--full"
            id="mainPanelSurface"
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
