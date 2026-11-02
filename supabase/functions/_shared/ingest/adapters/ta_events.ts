// Adapter: tw_tourism_events — Tourism Administration Event-json.zip
// Docs: docs/data-sources.md §2, docs/ingestion.md §4.2.
// Same zip/conditional-GET handling as attractions; each event = one occurrence.
import { fetchWithRetry, FetchResult } from '../http.ts';
import {
  parseZip, stripBom, toI18n, textArray, isHttpsUrl,
} from './_util.ts';
import type { SourceRow, NormalizedEvent, RunOpts, EventStatus } from '../types.ts';

export const id = 'tw_tourism_events';
const EVENTS_KEY = 'Events';
const CONNECT_TIMEOUT_MS = 10000;
const TOTAL_TIMEOUT_MS = 90000;

export async function request(src: SourceRow, opts: RunOpts = {}): Promise<FetchResult> {
  if (opts.sourceFile) {
    const body = await Deno.readFile(opts.sourceFile);
    return {
      status: 200, ok: true, etag: null, lastModified: null,
      contentType: 'application/zip', body, headers: new Headers(),
    };
  }
  const url = String(src.config.url);
  return fetchWithRetry(url, {
    etag: src.http_etag ?? undefined,
    lastModified: src.http_last_modified ?? undefined,
    minIntervalMs: 1000,
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
    totalTimeoutMs: TOTAL_TIMEOUT_MS,
  });
}

interface RawEvent {
  EventID: string;
  EventName: string | null;
  Description: string | null;
  EventClasses: unknown[];
  EventStatus: string | null;
  IsAccessibleForFree: number | null;
  FeeInfo: string | null;
  Organizations: Array<{ Name: string | null }> | null;
  WebsiteURL: string | null;
  ReservationURLs: string[] | null;
  Images: Array<{ Name: string | null; Description: string | null; URL: string | null }> | null;
  Tags: unknown[];
  UpdateTime: string | null;
  StartDateTime: string | null;
  EndDateTime: string | null;
  PostalAddress: {
    City: string | null; CityCode: string | null; Town: string | null;
    TownCode: string | null; ZipCode: string | null; StreetAddress: string | null;
  } | null;
  PositionLat: number | null;
  PositionLon: number | null;
  [key: string]: unknown;
}

export function parse(body: Uint8Array, src: SourceRow): RawEvent[] {
  const zip = parseZip(body);
  const listMember = String(src.config.list_member ?? 'EventList.json');
  const text = stripBom(new TextDecoder().decode(zip[listMember]));
  const envelope = JSON.parse(text);
  return (envelope[EVENTS_KEY] ?? []) as RawEvent[];
}

const STATUS_MAP: Record<string, EventStatus> = {
  EventScheduled: 'scheduled', EventCancelled: 'cancelled',
  EventPostponed: 'postponed', EventRescheduled: 'rescheduled',
};

export function normalize(records: unknown[], _src: SourceRow): {
  rows: NormalizedEvent[];
  rejected: Array<{ stage: string; sourceRecordId: string | null; message: string }>;
} {
  const rows: NormalizedEvent[] = [];
  const rejected: Array<{ stage: string; sourceRecordId: string | null; message: string }> = [];

  for (const raw of records) {
    const e = raw as RawEvent;
    const sourceId = e.EventID;
    if (!sourceId) {
      rejected.push({ stage: 'normalize', sourceRecordId: null, message: 'missing EventID' });
      continue;
    }
    const name = e.EventName ?? '';
    if (name.trim() === '') {
      rejected.push({ stage: 'normalize', sourceRecordId: sourceId, message: 'missing name' });
      continue;
    }

    const classes = textArray(e.EventClasses);
    const tags = textArray(e.Tags);
    const txt = `${name} ${e.Description ?? ''} ${tags.join(' ')}`;

    const base = classes.includes('204') ? 70 : 0;
    let rawScore = base;
    const kidTags: string[] = [];
    if (classes.includes('204') || /親子|兒童|孩童|小朋友|幼兒|寶寶/.test(txt)) {
      rawScore += 50; kidTags.push('family');
    }
    if (/DIY|手作|體驗|闖關|童玩/.test(txt)) rawScore += 10;
    if (e.IsAccessibleForFree === 1) kidTags.push('free');

    const score = Math.min(100, Math.max(0, rawScore));
    const occurrences = (e.StartDateTime
      ? [{
        starts_at: e.StartDateTime,
        ends_at: e.EndDateTime ?? null,
        venue_name: {},
        address: toI18n([
          e.PostalAddress?.City ?? '', e.PostalAddress?.Town ?? '',
          e.PostalAddress?.StreetAddress ?? '',
        ].join('') || null),
        city_code: e.PostalAddress?.CityCode ?? null,
        city_name: e.PostalAddress?.City ?? null,
        district_code: e.PostalAddress?.TownCode ?? null,
        district_name: e.PostalAddress?.Town ?? null,
        lat: e.PositionLat ?? null,
        lng: e.PositionLon ?? null,
        price_text: {},
        ticket_url: null,
      }]
      : []).filter((o) => o.starts_at != null);

    if (occurrences.length === 0) {
      rejected.push({ stage: 'normalize', sourceRecordId: sourceId, message: 'no occurrence with starts_at' });
      continue;
    }

    const images = (e.Images ?? [])
      .map((img) => ({ url: img.URL ?? '', caption: toI18n(img.Name), credit: img.Description ?? null }))
      .filter((img) => isHttpsUrl(img.url));

    const organizer = e.Organizations?.map((o) => o.Name).filter(Boolean).join('、');

    rows.push({
      source_id: sourceId,
      name: toI18n(name),
      description: toI18n(e.Description),
      source_categories: classes,
      tags,
      kid_tags: [...new Set(kidTags)].sort(),
      kid_score: score,
      status: STATUS_MAP[e.EventStatus ?? ''] ?? 'scheduled',
      is_free: e.IsAccessibleForFree === 1 ? true
        : e.IsAccessibleForFree === 0 ? false : null,
      price_text: toI18n(e.FeeInfo),
      organizer: organizer ? { 'zh-Hant': organizer } : {},
      website_url: e.WebsiteURL?.trim() || null,
      ticket_url: e.ReservationURLs?.[0]?.trim() || null,
      source_url: null,
      images,
      city_code: null,
      city_name: null,
      district_code: null,
      district_name: null,
      lat: null,
      lng: null,
      source_updated_at: e.UpdateTime ?? null,
      occurrences,
      raw: e,
    });
  }
  return { rows, rejected };
}
