// Adapter: taipei_travel_attractions — Taipei Travel Open API
// Docs: docs/data-sources.md §4, §4.7. Disabled by default (Cloudflare challenge,
// ADR-0003); reachable only via explicit CLI invocation. Detects the Cloudflare
// challenge and fails fast with error_class = 'blocked', no retries.
//
// Endpoints (from the Swagger spec): GET /{lang}/Attractions/All?page={n}
// (30 records per page; envelope shape unverified: { total, data: [...] }).
import { fetchWithRetry, BlockedError, FetchResult } from '../http.ts';
import type { SourceRow } from '../types.ts';

export const id = 'taipei_travel_attractions';
const PAGE_SIZE = 30;
const CONNECT_TIMEOUT_MS = 10000;
const TOTAL_TIMEOUT_MS = 30000;

function pageUrl(src: SourceRow, lang: string, page: number): string {
  const base = String(src.config.base_url ?? 'https://www.travel.taipei/open-api');
  return `${base}/${lang}/Attractions/All?page=${page}`;
}

export async function request(src: SourceRow): Promise<FetchResult> {
  const config = src.config as {
    langs?: string[]; page_size?: number; min_interval_ms?: number;
    base_url?: string;
  };
  const langs = Array.isArray(config.langs) && config.langs.length
    ? config.langs : ['zh-tw'];
  const pageSize = config.page_size ?? PAGE_SIZE;
  const minIntervalMs = config.min_interval_ms ?? 1000;

  const parts: string[] = [];
  let total = -1;
  let fetched = 0;

  for (const lang of langs) {
    let page = 1;
    for (;;) {
      const res = await fetchWithRetry(pageUrl(src, lang, page), {
        minIntervalMs,
        connectTimeoutMs: CONNECT_TIMEOUT_MS,
        totalTimeoutMs: TOTAL_TIMEOUT_MS,
        headers: { Accept: 'application/json' },
      });
      fetched += 1;

      if (res.status === 204) break;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        throw new BlockedError(
          `Taipei Travel API returned non-JSON (HTTP ${res.status}, ${ct}) ` +
            `for ${lang} page ${page}`,
          res.status,
        );
      }
      const payload = JSON.parse(new TextDecoder().decode(res.body));
      if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data)) {
        throw new Error(
          `Taipei Travel API envelope mismatch for ${lang} page ${page}: ` +
            `expected { total, data: [...] }`,
        );
      }
      total = payload.total ?? total;
      parts.push(new TextDecoder().decode(res.body));
      if (payload.data.length === 0) break;
      page += 1;
      if (total >= 0 && page * pageSize >= total) break;
    }
  }

  const body = new TextEncoder().encode(
    JSON.stringify({ lang: langs, fetched, total, parts }),
  );
  return {
    status: 200, ok: true, etag: null, lastModified: null,
    contentType: 'application/json', body, headers: new Headers(),
  };
}

export function parse(body: Uint8Array, _src: SourceRow): unknown[] {
  try {
    const summary = JSON.parse(new TextDecoder().decode(body));
    const parts: string[] = summary.parts ?? [];
    return parts.flatMap((p) => {
      const envelope = JSON.parse(p);
      return Array.isArray(envelope.data) ? envelope.data : [];
    });
  } catch (err) {
    if (err instanceof BlockedError) throw err;
    throw new Error(`taipei_travel: failed to parse response: ${err}`);
  }
}

export function normalize(): { rows: never[]; rejected: never[] } {
  // Language merging into one row per id happens at normalize time; not
  // implemented beyond blocked detection in v1 (source is disabled).
  return { rows: [], rejected: [] };
}
