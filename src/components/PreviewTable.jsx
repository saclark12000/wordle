import { useDeferredValue } from 'react';

export function PreviewTable({ rows, columns }) {
  const deferredRows = useDeferredValue(rows);

  if (!columns.length) {
    return (
      <div className="tableWrap">
        <table id="previewTable" />
      </div>
    );
  }

  return (
    <div className="tableWrap">
      <table id="previewTable">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {deferredRows.map((row, index) => (
            <tr key={row.__rowIndex ?? `${index}-${String(row[columns[0]] ?? '')}`}>
              {columns.map((column) => (
                <td key={`${row.__rowIndex ?? index}-${column}`}>{String(row[column] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
