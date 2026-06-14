// scripts/harvest/datagov.mjs
// Generic fetcher for data.gov.tw resources (or any open-data JSON/CSV URL).
// Supply resources via the DATAGOV_RESOURCES env var (see config.mjs).

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  // Some data.gov.tw endpoints wrap rows under result.records / result / data.
  const json = JSON.parse(text);
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.result?.records)) return json.result.records;
  if (Array.isArray(json?.result)) return json.result;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.records)) return json.records;
  return [];
}

function parseCsv(text) {
  // Minimal RFC-4180-ish CSV parser (handles quotes + embedded commas/newlines).
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

async function fetchResource(resource) {
  const res = await fetch(resource.url, { headers: { accept: 'application/json, text/csv' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text();
  let rows;
  if (ctype.includes('csv') || resource.url.toLowerCase().endsWith('.csv')) {
    rows = parseCsv(text);
  } else {
    const json = JSON.parse(text);
    rows = Array.isArray(json) ? json
      : json?.result?.records || json?.result || json?.data || json?.records || [];
  }
  return rows;
}

export async function harvestDatagov(datagov) {
  if (!datagov.enabled || !datagov.resources.length) {
    if (datagov.enabled) console.log('data.gov.tw: no resources configured (DATAGOV_RESOURCES empty).');
    return [];
  }
  console.log('Harvesting data.gov.tw resources...');
  const all = [];
  for (const resource of datagov.resources) {
    try {
      const rows = await fetchResource(resource);
      console.log(`  ${resource.label}: ${rows.length} rows`);
      for (let i = 0; i < rows.length; i++) {
        all.push({
          raw: rows[i],
          type: resource.type || 'other',
          source: `datagov:${resource.label}`,
          sourceIndex: i,
        });
      }
    } catch (e) {
      console.error(`  ! ${resource.label} failed: ${e.message}`);
    }
  }
  return all;
}

export { fetchJson }; // exported for ad-hoc use / testing
