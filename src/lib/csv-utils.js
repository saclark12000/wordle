import Papa from 'papaparse';

export function attachRowIndexes(rows) {
  rows.forEach((row, index) => {
    Object.defineProperty(row, '__rowIndex', {
      value: index,
      enumerable: false,
      configurable: true
    });
  });
  return rows;
}

export function parseCsvDocument(text) {
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false
  });
  const rows = Array.isArray(parsed.data) ? parsed.data : [];
  const columns = Array.isArray(parsed.meta?.fields)
    ? parsed.meta.fields
    : rows[0]
      ? Object.keys(rows[0])
      : [];

  return {
    rows: attachRowIndexes(rows),
    columns,
    errors: Array.isArray(parsed.errors) ? parsed.errors : []
  };
}

export async function loadUtf8Text(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
  return decoder ? decoder.decode(buffer) : response.text();
}
