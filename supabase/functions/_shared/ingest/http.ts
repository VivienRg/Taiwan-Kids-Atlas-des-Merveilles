// HTTP fetch with retries, backoff, conditional GET and per-host rate limiting.
// Rules: docs/ingestion.md §6.

export interface FetchOpts {
  etag?: string | null;
  lastModified?: string | null;
  minIntervalMs?: number;        // per-host minimum gap between requests (default 1000)
  connectTimeoutMs?: number;     // default 10000
  totalTimeoutMs?: number;       // default 90000 for zip downloads, 30000 for JSON APIs
  headers?: Record<string, string>;
}

export interface FetchResult {
  status: number;
  ok: boolean;
  etag: string | null;
  lastModified: string | null;
  contentType: string | null;
  body: Uint8Array;
  headers: Headers;
}

const lastRequest = new Map<string, number>(); // host -> epoch ms

class FetchError extends Error {
  constructor(
    message: string,
    public status: number,
    public errorClass: 'network' | 'http_4xx' | 'http_5xx' | 'blocked',
    public retryable: boolean,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

export class BlockedError extends FetchError {
  constructor(message: string, status: number) {
    super(message, status, 'blocked', false);
    this.name = 'BlockedError';
  }
}

export class ParseError extends Error {
  constructor(message: string, public context?: Record<string, unknown>) {
    super(message);
    this.name = 'ParseError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public context?: Record<string, unknown>) {
    super(message);
    this.name = 'ValidationError';
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fullJitter(attempt: number): number {
  // attempt is 1-based (first retry = 1). delay = random(0, min(60s, 2s * 2^attempt))
  const capMs = Math.min(60000, 2000 * Math.pow(2, attempt));
  return Math.random() * capMs;
}

function retryAfterMs(headers: Headers): number | null {
  const ra = headers.get('Retry-After');
  if (!ra) return null;
  const seconds = Number(ra);
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, 120000) : null;
}

// curl fallback for environments where Deno's fetch cannot reach the host.
// `curl -D -` emits headers followed by the body on stdout.
async function curlFetch(
  url: string,
  headers: Headers,
  totalTimeoutMs: number,
  connectTimeoutMs: number,
): Promise<FetchResult> {
  const args = [
    '-sS', '-D', '-',
    '--connect-timeout', String(Math.ceil(connectTimeoutMs / 1000) || 10),
    '--max-time', String(Math.ceil(totalTimeoutMs / 1000) || 10),
    url,
  ];
  for (const [name, value] of headers.entries()) args.push('-H', `${name}: ${value}`);
  const { stdout, code } = await new Deno.Command('curl', { args }).output();
  const sep = new TextEncoder().encode('\r\n\r\n');
  let split = -1;
  outer: for (let i = 0; i <= stdout.length - sep.length; i++) {
    for (let j = 0; j < sep.length; j++) {
      if (stdout[i + j] !== sep[j]) continue outer;
    }
    split = i;
    break;
  }
  const head = split === -1
    ? new TextDecoder().decode(stdout)
    : new TextDecoder().decode(stdout.slice(0, split));
  const body = split === -1 ? new Uint8Array(0) : stdout.slice(split + sep.length);
  const respHeaders = new Headers();
  let status = 0;
  for (const line of head.split('\r\n')) {
    if (!line) continue;
    if (line.startsWith('HTTP/')) {
      status = Number(line.split(' ')[1] ?? 0);
      continue;
    }
    const i = line.indexOf(': ');
    if (i === -1) continue;
    respHeaders.set(line.slice(0, i), line.slice(i + 2));
  }
  if (code !== 0) {
    throw new Error(`curl exited with code ${code}`);
  }
  return {
    status,
    ok: status >= 200 && status < 300,
    etag: respHeaders.get('etag') ?? null,
    lastModified: respHeaders.get('last-modified') ?? null,
    contentType: respHeaders.get('content-type') ?? null,
    body,
    headers: respHeaders,
  };
}

export async function fetchWithRetry(
  url: string,
  opts: FetchOpts = {},
): Promise<FetchResult> {
  const minIntervalMs = opts.minIntervalMs ?? 1000;
  const connectTimeoutMs = opts.connectTimeoutMs ?? 10000;
  const totalTimeoutMs = opts.totalTimeoutMs ?? 90000;
  const headers = new Headers({ 'Accept': '*/*' });
  if (opts.headers) for (const [k, v] of Object.entries(opts.headers)) headers.set(k, v);
  if (opts.etag) headers.set('If-None-Match', opts.etag);
  if (opts.lastModified) headers.set('If-Modified-Since', opts.lastModified);

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    // Per-host rate limit: gap between the start of consecutive requests.
    const host = hostOf(url);
    const prev = lastRequest.get(host);
    if (prev != null) {
      const gap = Date.now() - prev;
      if (gap < minIntervalMs) await sleep(minIntervalMs - gap);
    }
    lastRequest.set(host, Date.now());

    let res: Response | null = null;
    try {
      const fetchPromise = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), totalTimeoutMs);
        try {
          return await fetch(url, { headers, signal: controller.signal });
        } finally {
          clearTimeout(timeout);
        }
      })();
      res = await Promise.race([
        fetchPromise,
        new Promise<never>((_resolve, reject) =>
          setTimeout(
            () => reject(new Error(`fetch timed out after ${Math.min(totalTimeoutMs, 25000)} ms`)),
            Math.min(totalTimeoutMs, 25000),
          ),
        ),
      ]);
    } catch (err) {
      if (err instanceof BlockedError) throw err;
      const isAbort = err instanceof DOMException || (err as Error)?.name === 'AbortError';
      const msg = isAbort ? `request timed out after ${totalTimeoutMs} ms` : String((err as Error)?.message ?? err);
      // Fall back to curl when Deno's fetch cannot reach the host (sandboxed
      // environments, TLS fingerprinting, etc.). curl is universally available
      // and has hard timeouts, so this also bounds hangs.
      try {
        return await curlFetch(url, headers, totalTimeoutMs, connectTimeoutMs);
      } catch (curlErr) {
        lastErr = new FetchError(
          `${msg}; curl fallback: ${(curlErr as Error)?.message ?? curlErr}`,
          0, 'network', true);
      }
      await sleep(fullJitter(attempt + 1));
      continue;
    }

    // Cloudflare managed challenge: fail fast, never retry.
    if (
      res.status === 403 &&
      (res.headers.get('cf-mitigated') === 'challenge' ||
        (res.headers.get('content-type') ?? '').includes('text/html'))
    ) {
      const body = await res.text().catch(() => '');
      throw new BlockedError(
        `upstream returned HTTP 403 Cloudflare challenge (${body.slice(0, 120)})`,
        res.status,
      );
    }

    if (res.status === 304) {
      return { status: 304, ok: true, etag: res.headers.get('etag') ?? null,
        lastModified: res.headers.get('last-modified') ?? null,
        contentType: res.headers.get('content-type') ?? null,
        body: new Uint8Array(0), headers: res.headers };
    }

    if (res.status >= 200 && res.status < 300) {
      const body = await res.arrayBuffer();
      return {
        status: res.status,
        ok: true,
        etag: res.headers.get('etag') ?? null,
        lastModified: res.headers.get('last-modified') ?? null,
        contentType: res.headers.get('content-type') ?? null,
        body: new Uint8Array(body),
        headers: res.headers,
      };
    }

    // Retryable statuses: 408, 425, 429, 500, 502, 503, 504.
    const retryable =
      res.status === 408 || res.status === 425 || res.status === 429 ||
      res.status === 500 || res.status === 502 || res.status === 503 ||
      res.status === 504;
    const raMs = retryable ? retryAfterMs(res.headers) : null;
    const msg = `HTTP ${res.status} ${res.statusText}`;
    lastErr = new FetchError(msg, res.status,
      res.status >= 500 ? 'http_5xx' : 'http_4xx', retryable);
    if (!retryable) {
      // Non-retryable 4xx: surface immediately (caller decides, e.g. blocked).
      if (res.status === 403) {
        throw new BlockedError(msg, res.status);
      }
      throw lastErr;
    }
    await sleep(raMs ?? fullJitter(attempt + 1));
  }
  throw lastErr as Error;
}
