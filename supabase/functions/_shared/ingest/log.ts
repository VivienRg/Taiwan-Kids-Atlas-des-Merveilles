// Structured JSON logger: one object per line to stdout.
// Stages: start | fetch | parse | normalize | upsert | finish.
// Never log secrets, full rows or request headers.
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
// `?? 'info'` already guarantees a string, so no second fallback is needed
// (a newer TypeScript flags the redundant one as TS2869).
let level: LogLevel = (Deno.env.get('INGEST_LOG_LEVEL') ?? 'info') as LogLevel;

export function setLevel(l: LogLevel) {
  level = l;
}

export function log(
  source: string,
  runId: number | null,
  stage: string,
  event: string,
  msg: string,
  extra?: Record<string, unknown>,
) {
  const sev = LEVELS[event as LogLevel] ?? LEVELS.info;
  if (sev < LEVELS[level]) return;
  const out: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level: event,
    source,
    stage,
    event: msg,
  };
  if (runId != null) out['run_id'] = runId;
  if (extra) Object.assign(out, extra);
  Deno.stdout.writeSync(
    new TextEncoder().encode(JSON.stringify(out) + '\n'),
  );
}

export function error(
  source: string,
  runId: number | null,
  stage: string,
  msg: string,
  err?: unknown,
) {
  const extra: Record<string, unknown> = {};
  if (err instanceof Error) {
    extra.error = err.message;
  } else if (err != null) {
    extra.error = String(err);
  }
  log(source, runId, stage, 'error', msg, extra);
}
