// Core ingestion lifecycle: one implementation shared by the Edge Function
// (prod) and the CLI (dev). Docs: docs/ingestion.md §3.
//
// runSource()   = get source → start_run → ingestRun (used by CLI, and
//                 synchronously by the Edge Function for simplicity).
// ingestRun()   = fetch → parse → normalize → upsert → finish_run (assumes
//                 a running run_id already exists).
import { log, error } from './log.ts';
import { BlockedError } from './http.ts';
import {
  getSource, startRun, upsertPlaces, upsertEvents, logIngestionError,
  finishRun, end,
} from './db.ts';
import type { SourceRow, NormalizedPlace, NormalizedEvent, UpsertStats } from './types.ts';
import * as taAttractions from './adapters/ta_attractions.ts';
import * as taEvents from './adapters/ta_events.ts';
import * as mocEvents from './adapters/moc_events.ts';
import * as curated from './adapters/curated.ts';
import * as taipeiTravel from './adapters/taipei_travel.ts';

export const CODE_VERSION = Deno.env.get('INGEST_CODE_VERSION') ?? '1.0.0';
const DEADLINE_MS =
  Number.parseInt(Deno.env.get('INGEST_DEADLINE_MS') ?? '600000', 10) || 600000;

type Trigger = 'cron' | 'manual' | 'cli' | 'test';

interface RunOpts {
  dryRun?: boolean;      // fetch + normalize, print stats, no DB writes (CLI only)
  sourceFile?: string;   // offline zip/feed file (CLI only, TA sources)
}

interface RunOutcome {
  source: string;
  trigger: Trigger;
  status: 'succeeded' | 'partial' | 'failed' | 'skipped' | 'locked';
  runId: number | null;
  stats: { httpRequests: number; recordsFetched: number; recordsFailed: number };
  details: Record<string, unknown>;
  errorClass?: string;
  errorMessage?: string;
}

interface Adapter {
  id: string;
  kind: 'place' | 'event';
  request: (src: SourceRow, opts: RunOpts) => Promise<{ status: number; etag?: string | null; lastModified?: string | null; body: Uint8Array }>;
  parse: (body: Uint8Array) => unknown[];
  normalize: (records: unknown[], src: SourceRow) => { rows: unknown[]; rejected: Array<{ stage: string; sourceRecordId: string | null; message: string; context?: Record<string, unknown> }> };
}

const ADAPTERS: Record<string, Adapter> = {
  [taAttractions.id]: { id: taAttractions.id, kind: 'place' as const, ...taAttractions } as Adapter,
  [taEvents.id]: { id: taEvents.id, kind: 'event' as const, ...taEvents } as Adapter,
  [mocEvents.id]: { id: mocEvents.id, kind: 'event' as const, ...mocEvents } as Adapter,
  [curated.id]: { id: curated.id, kind: 'place' as const, ...curated } as Adapter,
  [taipeiTravel.id]: { id: taipeiTravel.id, kind: 'place' as const, ...taipeiTravel } as Adapter,
};

function chunk<T>(array: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

function deadlineExceeded(deadline: number): boolean {
  return Date.now() >= deadline;
}

const allSources = (): string[] => Object.keys(ADAPTERS);

export async function runSource(
  sourceId: string,
  trigger: Trigger,
  opts: RunOpts = {},
): Promise<RunOutcome> {
  const src = await getSource(sourceId);
  if (!src) {
    throw new Error(`unknown source ${sourceId}`);
  }

  if (!src.enabled && trigger === 'cron') {
    log(sourceId, null, 'start', 'skip', 'source disabled');
    return {
      source: sourceId, trigger, status: 'skipped', runId: null,
      stats: { httpRequests: 0, recordsFetched: 0, recordsFailed: 0 },
      details: { reason: 'disabled' },
    };
  }

  if (opts.dryRun) {
    const adapter = ADAPTERS[sourceId];
    if (!adapter) throw new Error(`no adapter for source ${sourceId}`);
    log(sourceId, null, 'fetch', 'start', `adapter=${adapter.id} (dry-run)`);
    const res = await adapter.request(src, opts);
    const records = adapter.parse(res.body, src);
    log(sourceId, null, 'parse', 'done', `records=${records.length}`);
    const { rows, rejected } = adapter.normalize(records, src);
    log(sourceId, null, 'normalize', 'done', `rows=${rows.length} rejected=${rejected.length}`);
    return {
      source: sourceId, trigger, status: 'succeeded', runId: null,
      stats: { httpRequests: 1, recordsFetched: records.length, recordsFailed: rejected.length },
      details: { dryRun: true, rows: rows.length, rejected: rejected.length },
    };
  }

  const locked = await startRun(sourceId, trigger, CODE_VERSION);
  if (locked.locked) {
    log(sourceId, null, 'start', 'skip', 'run already in progress');
    return {
      source: sourceId, trigger, status: 'locked', runId: null,
      stats: { httpRequests: 0, recordsFetched: 0, recordsFailed: 0 },
      details: { reason: 'locked' },
    };
  }

  return ingestRun(sourceId, locked.runId, src, trigger, opts);
}

export async function ingestRun(
  sourceId: string,
  runId: number,
  src: SourceRow,
  trigger: Trigger,
  opts: RunOpts = {},
): Promise<RunOutcome> {
  const startWall = Date.now();
  const adapter = ADAPTERS[sourceId];
  if (!adapter) throw new Error(`no adapter for source ${sourceId}`);

  let httpRequests = 0;
  let recordsFetched = 0;
  let recordsFailed = 0;
  let status: RunOutcome['status'] = 'succeeded';
  let errorClass: string | null = null;
  let errorMessage: string | null = null;
  const details: Record<string, unknown> = {};

  try {
    log(sourceId, runId, 'fetch', 'start', `adapter=${adapter.id}`);
    const res = await adapter.request(src, opts);
    httpRequests += 1;
    details['http'] = {
      status: res.status, etag: res.etag ?? null, last_modified: res.lastModified ?? null,
    };

    if (res.status === 304) {
      log(sourceId, runId, 'fetch', 'not_modified', 'feed unchanged');
      await finishRun(runId, 'skipped', { http_requests: httpRequests },
        null, null, { http: { status: 304 } });
      return { source: sourceId, trigger, status: 'skipped', runId,
        stats: { httpRequests, recordsFetched: 0, recordsFailed: 0 }, details };
    }

    log(sourceId, runId, 'parse', 'start', `bytes=${res.body.length}`);
    const records = adapter.parse(res.body, src);
    recordsFetched = records.length;
    log(sourceId, runId, 'parse', 'done', `records=${recordsFetched}`);

    if (recordsFetched === 0) {
      throw new Error('feed returned zero records; refusing removal-guard wipeout');
    }

    log(sourceId, runId, 'normalize', 'start', `records=${recordsFetched}`);
    const { rows, rejected } = adapter.normalize(records, src);
    for (const rej of rejected) {
      await logIngestionError(runId, rej.stage, rej.sourceRecordId, rej.message, rej.context ?? {});
      recordsFailed += 1;
    }
    log(sourceId, runId, 'normalize', 'done', `rows=${rows.length} rejected=${rejected.length}`);

    const maxBatch = Math.min(Number(src.config.batch_size ?? 500) || 500, 500);
    // deno-postgres sends one bind message per upsert call; on this dev box
    // TCP send/recv buffers are only 128 KiB, so a bigger bind deadlocks
    // (driver blocks writing, Postgres blocks reading). Chunk by byte budget
    // instead of row count since normalized rows vary wildly (raw payloads).
    const BYTE_BUDGET = 64 * 1024;
    const batches: unknown[][] = [];
    let current: unknown[] = [];
    let currentBytes = 0;
    for (const row of rows) {
      const rowBytes = new TextEncoder().encode(JSON.stringify(row)).length;
      if (
        current.length >= maxBatch ||
        (current.length > 0 && currentBytes + rowBytes > BYTE_BUDGET)
      ) {
        batches.push(current);
        current = [];
        currentBytes = 0;
      }
      current.push(row);
      currentBytes += rowBytes;
    }
    if (current.length) batches.push(current);
    const deadline = Date.now() + DEADLINE_MS;
    const upsert = adapter.kind === 'place' ? upsertPlaces : upsertEvents;
    let inserted = 0; let updated = 0; let unchanged = 0; let restored = 0;

    for (const batch of batches) {
      if (deadlineExceeded(deadline)) {
        status = 'partial';
        errorClass = 'timeout';
        errorMessage = 'ingest deadline reached before all batches were written';
        break;
      }
      const stats = await upsert(runId, batch);
      inserted += stats.inserted; updated += stats.updated;
      unchanged += stats.unchanged; restored += stats.restored;
      recordsFailed += stats.failed;
    }

    if (status === 'succeeded') {
      const rejectedRatio = recordsFetched ? rejected.length / recordsFetched : 0;
      if (rejectedRatio > 0.05) {
        status = 'partial';
        errorClass = 'validation';
        errorMessage = `${rejected.length} of ${recordsFetched} records rejected (>5%)`;
      }
    }

    log(sourceId, runId, 'finish', 'start', `status=${status}`);
    await finishRun(runId, status, {
      http_requests: httpRequests,
      records_fetched: recordsFetched,
      records_failed: recordsFailed,
    } as Record<string, unknown>, errorClass, errorMessage, details);

    log(sourceId, runId, 'finish', 'done', {
      inserted, updated, unchanged, restored, took_ms: Date.now() - startWall,
    });

    return {
      source: sourceId, trigger, status, runId,
      stats: { httpRequests, recordsFetched, recordsFailed },
      details,
      ...(errorClass ? { errorClass } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const eClass = err instanceof BlockedError ? 'blocked'
      : (err as { errorClass?: string }).errorClass ?? 'unknown';
    error(sourceId, runId, 'finish', message, err);
    try {
      await finishRun(runId, 'failed', {
        http_requests: httpRequests,
        records_fetched: recordsFetched,
        records_failed: recordsFailed,
      } as Record<string, unknown>, eClass, message, {});
    } catch (finishErr) {
      error(sourceId, runId, 'finish', `finish_run failed: ${finishErr}`, finishErr);
    }
    return {
      source: sourceId, trigger, status: 'failed', runId,
      stats: { httpRequests, recordsFetched, recordsFailed },
      details, errorClass: eClass, errorMessage: message,
    };
  } finally {
    await end();
  }
}

export { allSources };
