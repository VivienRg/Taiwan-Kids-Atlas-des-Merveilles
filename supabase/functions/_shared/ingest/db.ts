// Database access for the ingestion worker. All persistence logic lives in
// the atlas.* SQL functions (migrations 0400/0600/0700); this layer only
// calls them and translates errors into domain errors.
//
// DB access goes through the deno-postgres client
// (https://deno.land/x/postgres) using `SUPABASE_DB_URL` (Edge) or
// `DATABASE_URL` (CLI).
//
// `finish_run` returns a composite row; we project its scalar columns so the
// driver never has to decode a composite type. jsonb results are cast to text
// and parsed in TypeScript for the same reason.
import {
  Pool,
  PostgresError,
} from './vendor/postgres/mod.ts';

const DSN =
  Deno.env.get('SUPABASE_DB_URL') ??
  Deno.env.get('DATABASE_URL') ??
  'postgresql://postgres:postgres@localhost:54330/atlas_dev';

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    if (!DSN) {
      throw new Error('DATABASE_URL / SUPABASE_DB_URL must be set');
    }
    pool = new Pool(DSN, 10, true); // lazy: connects on first query
  }
  return pool;
}

export async function query<T>(sql: string, args: unknown[] = []): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const res = await client.queryObject<T>(sql, args);
    return res.rows;
  } finally {
    client.release();
  }
}

export interface PgError extends Error {
  fields?: { code?: string; message?: string; detail?: string; hint?: string };
}

function pgError(err: unknown): PgError {
  return err as PgError;
}

export function isRunLocked(err: unknown): boolean {
  const e = pgError(err);
  return e instanceof PostgresError && e.fields?.code === '55P03';
}

export interface SourceRow {
  id: string;
  kind: 'place' | 'event';
  name: unknown;
  publisher: unknown;
  attribution: unknown;
  license: string;
  license_url: string | null;
  homepage_url: string | null;
  dataset_url: string | null;
  enabled: boolean;
  is_full_snapshot: boolean;
  schedule_cron: string | null;
  min_keep_ratio: string;
  config: Record<string, unknown>;
  http_etag: string | null;
  http_last_modified: string | null;
}

export async function getSource(sourceId: string): Promise<SourceRow | null> {
  const rows = await query<SourceRow & {
    min_keep_ratio: unknown; config: string;
  }>(
    `select id, kind, name, publisher, attribution, license, license_url,
            homepage_url, dataset_url, enabled, is_full_snapshot,
            schedule_cron, min_keep_ratio, config::text as config,
            http_etag, http_last_modified
     from atlas.sources where id = $1`,
    [sourceId],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return { ...row, config: row.config ? JSON.parse(row.config) : {} } as SourceRow;
}

export interface StartRunResult {
  runId: number;
  locked: boolean;
}

export async function startRun(
  sourceId: string,
  trigger: string,
  codeVersion: string | null,
): Promise<StartRunResult> {
  try {
    const rows = await query<{ start_run: bigint | number }>(
      `select atlas.start_run($1::text, $2::text, $3::text) as start_run`,
      [sourceId, trigger, codeVersion],
    );
    return { runId: Number(rows[0].start_run), locked: false };
  } catch (err) {
    if (isRunLocked(err)) return { runId: 0, locked: true };
    throw err;
  }
}

export interface UpsertStats {
  received: number;
  inserted: number;
  updated: number;
  unchanged: number;
  restored: number;
  failed: number;
}

export async function upsertPlaces(runId: number, rows: unknown[]): Promise<UpsertStats> {
  const result = await query<{ upsert_places: string }>(
    `select atlas.upsert_places($1::bigint, $2::jsonb)::text as upsert_places`,
    [runId, JSON.stringify(rows)],
  );
  return JSON.parse(result[0].upsert_places) as UpsertStats;
}

export async function upsertEvents(runId: number, rows: unknown[]): Promise<UpsertStats> {
  const result = await query<{ upsert_events: string }>(
    `select atlas.upsert_events($1::bigint, $2::jsonb)::text as upsert_events`,
    [runId, JSON.stringify(rows)],
  );
  return JSON.parse(result[0].upsert_events) as UpsertStats;
}

export async function logIngestionError(
  runId: number,
  stage: string,
  sourceRecordId: string | null,
  message: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  await query(
    `select atlas.log_ingestion_error($1::bigint, $2::text, $3::text, $4::text, $5::jsonb)`,
    [runId, stage, sourceRecordId ?? null, message, JSON.stringify(context)],
  );
}

export interface FinishRunResult {
  status: string;
  errorClass: string | null;
  errorMessage: string | null;
}

export async function finishRun(
  runId: number,
  status: string,
  counters: Record<string, unknown> = {},
  errorClass?: string | null,
  errorMessage?: string | null,
  details: Record<string, unknown> = {},
): Promise<FinishRunResult> {
  // finish_run returns a composite (atlas.ingestion_runs) row; execute it
  // once, then read back the scalar columns we need. This avoids asking the
  // driver to decode a composite type and runs the function exactly once.
  await query(
    `select atlas.finish_run($1::bigint, $2::text, $3::jsonb, $4::text, $5::text, $6::jsonb)`,
    [runId, status, JSON.stringify(counters), errorClass ?? null,
      errorMessage ?? null, JSON.stringify(details)],
  );
  const rows = await query<{
    status: string;
    error_class: string | null;
    error_message: string | null;
  }>(`select status, error_class, error_message
     from atlas.ingestion_runs where id = $1`, [runId]);
  const row = rows[0];
  return { status: row.status, errorClass: row.error_class, errorMessage: row.error_message };
}

export async function end() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
