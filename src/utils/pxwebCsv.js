




export function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}









export function parseAnnualMetricCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return new Map();
  const headers = parseCsvLine(lines[0]);
  const cells = parseCsvLine(lines[1]);

  const valueByYear = new Map();
  for (let i = 2; i < headers.length; i += 1) {
    const match = headers[i].match(/(\d{4})/);
    if (!match) continue;
    const raw = Number(cells[i]);
    valueByYear.set(Number(match[1]), Number.isFinite(raw) && raw > 0 ? raw : null);
  }
  return valueByYear;
}







export async function postPxwebQueryOnce(tableUrl, query, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(tableUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(query),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
