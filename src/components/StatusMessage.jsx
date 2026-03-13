export function StatusMessage({ status, className = '' }) {
  const html = status?.html || '';
  if (!html) return null;

  return (
    <div
      className={['status', status?.kind || '', className].filter(Boolean).join(' ')}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
