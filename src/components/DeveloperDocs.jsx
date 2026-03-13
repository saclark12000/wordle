export function DeveloperDocs({ developerMode, docs }) {
  if (!developerMode) {
    return <div className="status">Enable developer mode to view docs.</div>;
  }

  if (docs.loading) {
    return <div className="status">Loading documentation...</div>;
  }

  return (
    <div className="developerDocs">
      {docs.entries.map((doc) => (
        <article key={doc.title} className="developerDocs__entry">
          <h3>{doc.title}</h3>
          {doc.error ? (
            <div className="status warn">Unable to load {doc.path}.</div>
          ) : (
            <div
              className="developerDocs__content"
              dangerouslySetInnerHTML={{ __html: doc.html }}
            />
          )}
        </article>
      ))}
    </div>
  );
}
