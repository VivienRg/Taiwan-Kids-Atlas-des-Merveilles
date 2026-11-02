// Supabase Edge Function entrypoint: POST /functions/v1/ingest
// Docs: docs/ingestion.md §7 (HTTP contract).
//
// Body: { "source": "tw_tourism_attractions", "trigger": "cron" }
// Auth: Authorization: Bearer $INGEST_CRON_SECRET (constant-time compare)
//
// start_run is executed synchronously so the caller gets a run_id back; the
// fetch/upsert/finish work then continues in EdgeRuntime.waitUntil (the pattern
// documented in docs/ingestion.md §7) and the response is 202 immediately.
//
// Why not answer after the work is done: the caller is pg_cron -> pg_net through
// the Supabase gateway (Kong), and both have request timeouts far below a real
// run. Measured on the local stack on 2026-11-03: with the old synchronous
// response, a live MOC run hit pg_net's 10 s client timeout, the runtime logged
// `WorkerRequestCancelled`, the run stayed `running` until the 2 h sweeper and
// nothing was ingested. Answering 202 first keeps every run well inside those
// limits; the truth about the run is always in atlas.ingestion_runs.
// Deno.serve is the native Supabase Edge Runtime entrypoint (the std/http
// serve() helper is deprecated and would add a remote deno.land dependency to
// lint/typecheck/CI). The handler contract is unchanged.
// NOTE: the shared code lives at supabase/functions/_shared/, one directory up
// from this function — `./_shared/...` does not resolve and the function would
// fail to bundle (`deno check` catches it).
// ingestRun() lives in the shared core, getSource/startRun/end in the db layer;
// importing all four from db.ts does not resolve and the function would fail to
// load at runtime.
import { getSource, startRun, end } from '../_shared/ingest/db.ts';
import { log, error } from '../_shared/ingest/log.ts';
import { ingestRun, CODE_VERSION } from '../_shared/ingest/core.ts';
import type { SourceRow, Trigger } from '../_shared/ingest/types.ts';

// Supabase's edge runtime provides this global; Deno's own types do not.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

/** Available in the Supabase edge runtime (hosted and `supabase functions serve`). */
function backgroundHost(): { waitUntil(promise: Promise<unknown>): void } | null {
  return typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function'
    ? EdgeRuntime
    : null;
}

// Only the documented trigger values reach atlas.ingestion_runs.trigger;
// anything else is treated as a manual run (which never skips a disabled
// source, unlike 'cron').
function asTrigger(value: unknown): Trigger {
  return value === 'cron' || value === 'cli' || value === 'test' || value === 'manual'
    ? value
    : 'manual';
}

const SECRET = Deno.env.get('INGEST_CRON_SECRET');

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!SECRET || !constantTimeCompare(provided, SECRET)) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: { source?: string; trigger?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const source: string | undefined = body.source;
  const trigger: Trigger = body.trigger === undefined ? 'cron' : asTrigger(body.trigger);
  if (!source || typeof source !== 'string') {
    return json({ error: 'missing_source' }, 400);
  }

  let src: SourceRow | null;
  try {
    src = await getSource(source);
  } catch (err) {
    error(source, null, 'start', `db error: ${err}`, err);
    return json({ error: 'db_error' }, 500);
  }
  if (!src) {
    return json({ error: 'unknown_source', source }, 400);
  }

  if (!src.enabled && trigger === 'cron') {
    log(source, null, 'start', 'skip', 'source disabled');
    return json({ accepted: false, reason: 'disabled', source }, 200);
  }

  let runId: number;
  try {
    const started = await startRun(source, trigger, CODE_VERSION);
    if (started.locked) {
      log(source, null, 'start', 'skip', 'run already in progress');
      return json({ accepted: false, reason: 'locked', source }, 409);
    }
    runId = started.runId;
  } catch (err) {
    error(source, null, 'start', `start_run failed: ${err}`, err);
    return json({ error: 'start_run_failed', message: String(err) }, 500);
  }

  const host = backgroundHost();
  log(source, runId, 'start', 'accepted',
    `trigger=${trigger} mode=${host ? 'background' : 'synchronous'}`);

  const work = ingestRun(source, runId, src, trigger);

  if (host) {
    // 202 now, finish in the background. Without this the request would have to
    // outlive the gateway's timeout and be cancelled mid-run (see the header).
    host.waitUntil(
      work
        .then((result) => log(source, runId, 'finish', 'done', `background run ${result.status}`))
        .catch((err) => error(source, runId, 'finish', `background run failed: ${err}`, err))
        .finally(() => end()),
    );
    return json({ accepted: true, source, run_id: runId, status: 'running' }, 202);
  }

  // No background API in this runtime (plain `deno run`, older runtimes): keep
  // the original synchronous behaviour so the caller still sees the outcome.
  try {
    const result = await work;
    // result already carries `source`; only the run id needs shaping.
    return json({ accepted: true, run_id: runId, ...result }, 202);
  } catch (err) {
    error(source, runId, 'finish', `ingest failed: ${err}`, err);
    // ingestRun already records a failed run; surface the outcome anyway.
    return json({ accepted: true, source, run_id: runId, status: 'failed',
      errorMessage: String(err) }, 202);
  } finally {
    await end();
  }
});
