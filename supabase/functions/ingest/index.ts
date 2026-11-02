// Supabase Edge Function entrypoint: POST /functions/v1/ingest
// Docs: docs/ingestion.md §7 (HTTP contract).
//
// Body: { "source": "tw_tourism_attractions", "trigger": "cron" }
// Auth: Authorization: Bearer $INGEST_CRON_SECRET (constant-time compare)
//
// The run is started synchronously (start_run) so the caller gets a run_id;
// the fetch/upsert/finish work runs to completion before responding (typical
// run: seconds for 6,205 places), which keeps this simple and correct within
// Edge Function limits. Switching to pg_net fire-and-forget + waitUntil needs
// no changes to the shared core.
import { serve } from 'std/http/server.ts';
import { getSource, startRun, ingestRun, end } from './_shared/ingest/db.ts';
import { log, error } from './_shared/ingest/log.ts';
import { CODE_VERSION } from './_shared/ingest/core.ts';
import type { SourceRow } from './_shared/ingest/types.ts';

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

serve(async (req) => {
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
  const trigger: string = body.trigger ?? 'cron';
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

  log(source, runId, 'start', 'accepted', `trigger=${trigger}`);
  try {
    const result = await ingestRun(source, runId, src, trigger);
    return json({ accepted: true, source, run_id: runId, ...result }, 202);
  } catch (err) {
    error(source, runId, 'finish', `ingest failed: ${err}`, err);
    // ingestRun already records a failed run; surface the outcome anyway.
    return json({ accepted: true, source, run_id: runId, status: 'failed',
      errorMessage: String(err) }, 202);
  } finally {
    await end();
  }
});
