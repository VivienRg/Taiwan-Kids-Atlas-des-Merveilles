// Integration test against a real local Postgres (atlas_dev on 54330).
// Exercises the SQL upsert/run lifecycle (start_run → upsert_places → finish_run)
// end to end, including idempotency and the removal-guard behaviour.
// Skips gracefully when no DATABASE_URL is reachable (e.g. CI without a DB).
import {
  finishRun,
  getSource,
  query,
  startRun,
  upsertPlaces,
} from '../db.ts';
import { assert, assertEquals } from '../vendor/test_helpers.ts';

// The DSN itself is resolved by db.ts from DATABASE_URL (or SUPABASE_DB_URL),
// falling back to the docker-compose Postgres on 54330.
const SOURCE = 'curated'; // full-snapshot source: removal guard protects seed data
const PREFIX = 'integ-test-';

function placeRow(suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    source_id: `${PREFIX}${suffix}`,
    name: { 'zh-Hant': '整合測試景點', en: 'Integration Test Place' },
    city_code: 'TPE',
    city_name: '台北市',
    district_code: '001',
    district_name: '中正區',
    lat: '25.033',
    lng: '121.5',
    source_categories: ['park'],
    kid_score: 60,
    is_free: true,
    price_level: 1,
    tags: ['playground'],
    kid_tags: ['diy'],
    age_min: 3,
    age_max: 12,
    indoor_outdoor: 'outdoor',
    facilities: ['restroom'],
    images: [],
    opening_hours: {},
    service_status: 'open',
    source_updated_at: null,
    raw: { test: true },
    ...overrides,
  };
}

let failures = 0;
let runId: number | null = null;

async function check(name: string, fn: () => unknown): Promise<void> {
  try {
    await fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL ${name}:`, (err as Error).message);
  }
}

export async function runIntegrationTests(): Promise<void> {
  if (!Deno.env.get('DATABASE_URL')) {
    try {
      // Probe the default local DSN; skip silently if unreachable.
      await query(`select 1 as ok`);
    } catch {
      console.log('ok  integration tests (skipped: no reachable Postgres)');
      return;
    }
  }

  await check('source resolves', async () => {
    const src = await getSource(SOURCE);
    assert(src, 'curated source exists');
    if (!src) throw new Error('curated source missing from atlas.sources');
    assertEquals(src.enabled, true);
    assertEquals(src.is_full_snapshot, true);
    assertEquals(src.kind, 'place');
  });

  await check('start_run creates a run', async () => {
    const started = await startRun(SOURCE, 'test', 'integration');
    assert(!started.locked, 'run was not locked');
    assert(started.runId != null && started.runId > 0, 'runId returned');
    runId = started.runId;
  });

  await check('start_run locks on re-entrant run', async () => {
    const locked = await startRun(SOURCE, 'test', 'integration');
    assert(locked.locked, 'concurrent run was rejected');
  });

  await check('first upsert inserts rows', async () => {
    assert(runId != null, 'runId set');
    const stats = await upsertPlaces(runId!, [
      placeRow('a', { kid_score: 70 }),
      placeRow('b', { kid_score: 40 }),
      placeRow('c'),
    ]);
    assertEquals(stats.inserted, 3);
    assertEquals(stats.updated, 0);
    assertEquals(stats.unchanged, 0);
    assertEquals(stats.received, 3);
  });

  await check('re-upsert identical rows are unchanged', async () => {
    assert(runId != null, 'runId set');
    const stats = await upsertPlaces(runId!, [
      placeRow('a', { kid_score: 70 }),
      placeRow('b', { kid_score: 40 }),
      placeRow('c'),
    ]);
    assertEquals(stats.inserted, 0);
    assertEquals(stats.updated, 0);
    assertEquals(stats.unchanged, 3);
  });

  await check('changed rows are updated, new rows inserted', async () => {
    assert(runId != null, 'runId set');
    const stats = await upsertPlaces(runId!, [
      placeRow('a', { kid_score: 90 }), // changed
      placeRow('b', { kid_score: 40 }), // unchanged
      placeRow('d'), // new
    ]);
    assertEquals(stats.inserted, 1);
    assertEquals(stats.updated, 1);
    assertEquals(stats.unchanged, 1);
  });

  await check('rows persist in atlas.places', async () => {
    assert(runId != null, 'runId set');
    const rows = await query<{ source_id: string; kid_score: number }>(
      `select source_id, kid_score from atlas.places
       where source = $1 and source_id like $2
       order by source_id`,
      [SOURCE, `${PREFIX}%`],
    );
    const byId = Object.fromEntries(
      rows.map((r) => [r.source_id, r.kid_score]),
    );
    assertEquals(byId[`${PREFIX}a`], 90);
    assertEquals(byId[`${PREFIX}b`], 40);
    assertEquals(byId[`${PREFIX}c`], 60);
    assertEquals(byId[`${PREFIX}d`], 60);
  });

  await check('finish_run marks the run succeeded and trips the guard', async () => {
    assert(runId != null, 'runId set');
    // curated is full-snapshot with min_keep_ratio 0.50: this run sees 4 rows
    // of 90+ active curated places → guard trips, nothing removed.
    const finished = await finishRun(runId!, 'succeeded', {
      http_requests: 1,
      records_fetched: 4,
      records_failed: 0,
    });
    assertEquals(finished.status, 'partial');
    assertEquals(finished.errorClass, 'guard');
  });

  // Cleanup test data so the dev DB stays tidy. The run row is left in place
  // (sources.last_run_id references it).
  if (runId != null) {
    try {
      await query(
        `delete from atlas.places where source = $1 and source_id like $2`,
        [SOURCE, `${PREFIX}%`],
      );
    } catch {
      // best effort
    }
  }

  if (failures > 0) {
    console.error(`FAILED: ${failures} integration test(s)`);
    Deno.exit(1);
  }
  console.log('ok  integration tests');
}
