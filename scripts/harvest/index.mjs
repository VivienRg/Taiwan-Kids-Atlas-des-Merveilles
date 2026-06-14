// scripts/harvest/index.mjs
// Orchestrator: fetch (TDX + data.gov.tw) -> normalize -> dedupe -> write places.json + stats.
//
// Usage:  node scripts/harvest/index.mjs
// Env:    TDX_CLIENT_ID, TDX_CLIENT_SECRET   (required for TDX)
//         DATAGOV_RESOURCES                   (optional: "label|type|url,...")
// See scripts/harvest/config.mjs for all knobs.

import fs from 'fs';
import path from 'path';
import { config } from './config.mjs';
import { harvestTdx } from './tdx.mjs';
import { harvestDatagov } from './datagov.mjs';
import { normalizeAll } from './normalize.mjs';
import { dedupe } from './dedupe.mjs';

function tally(places, field) {
  const m = {};
  for (const p of places) {
    const vals = Array.isArray(p[field]) ? p[field] : [p[field]];
    for (const v of vals) {
      const key = v == null || v === '' ? '(none)' : String(v);
      m[key] = (m[key] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
}

async function main() {
  const harvestedAt = new Date().toISOString();

  const [tdxRecords, datagovRecords] = await Promise.all([
    harvestTdx(config.tdx),
    harvestDatagov(config.datagov),
  ]);

  const rawRecords = [...tdxRecords, ...datagovRecords];
  console.log(`\nFetched ${rawRecords.length} raw records `
    + `(TDX: ${tdxRecords.length}, data.gov.tw: ${datagovRecords.length})`);

  if (!rawRecords.length) {
    console.error('No records fetched. Check credentials / network. Not overwriting output.');
    process.exit(1);
  }

  const normalized = normalizeAll(rawRecords, harvestedAt);
  console.log(`Normalized ${normalized.length} records`);

  const { places, mergedCount } = dedupe(normalized, config.dedupe);
  places.sort((a, b) =>
    (a.region || '').localeCompare(b.region || '', 'zh-Hant') ||
    (a.name || '').localeCompare(b.name || '', 'zh-Hant'));
  console.log(`Deduped: ${places.length} unique places (${mergedCount} merges)`);

  const stats = {
    harvested_at: harvestedAt,
    total: places.length,
    raw_total: rawRecords.length,
    merges: mergedCount,
    by_type: tally(places, 'type'),
    by_audience: tally(places, 'audience'),
    by_region: tally(places, 'region'),
    by_tag: tally(places, 'tags'),
    with_age_range: places.filter((p) => p.age_range).length,
    with_position: places.filter((p) => p.position).length,
  };

  fs.mkdirSync(path.dirname(config.output.places), { recursive: true });
  fs.writeFileSync(config.output.places, JSON.stringify(places, null, 2));
  fs.writeFileSync(config.output.stats, JSON.stringify(stats, null, 2));

  console.log(`\nWrote ${config.output.places} (${places.length} places)`);
  console.log(`Wrote ${config.output.stats}`);
  console.log('Summary:', JSON.stringify({
    by_type: stats.by_type, by_audience: stats.by_audience,
    top_regions: Object.fromEntries(Object.entries(stats.by_region).slice(0, 8)),
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
