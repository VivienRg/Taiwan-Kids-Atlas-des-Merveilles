// Adapter: moc_kids_events — Ministry of Culture activityOpenData category 4 (親子)
// Docs: docs/data-sources.md §3, docs/ingestion.md §4.6.
// Plain JSON array, no ETag, one request per run.
import { fetchWithRetry, FetchResult } from '../http.ts';
import { toI18n, textArray, isHttpsUrl } from './_util.ts';
import type { SourceRow, NormalizedEvent } from '../types.ts';

export const id = 'moc_kids_events';
const CONNECT_TIMEOUT_MS = 10000;
const TOTAL_TIMEOUT_MS = 30000;

export function request(src: SourceRow): Promise<FetchResult> {
  const url = String(src.config.url);
  return fetchWithRetry(url, {
    minIntervalMs: 1000,
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
    totalTimeoutMs: TOTAL_TIMEOUT_MS,
  });
}

interface RawMocEvent {
  UID: string;
  title: string | null;
  category: string | null;
  descriptionFilterHtml: string | null;
  showInfo: Array<{
    time: string | null; endTime: string | null; location: string | null;
    locationName: string | null; price: string | null; latitude: string | number | null;
    longitude: string | number | null;
  }> | null;
  masterUnit: string[] | null;
  imageUrl: string | null;
  sourceWebPromote: string | null;
  webSales: string | null;
  discountInfo: string | null;
  editModifyDate: string | null;
  [key: string]: unknown;
}

function twTime(value: string | null | undefined): string | null {
  if (!value) return null;
  // "2026/11/07 13:00:00" (local Asia/Taipei, no offset) -> "2026-11-07T13:00:00+08:00"
  const m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(value.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}+08:00`;
}

// "桃園文學館（桃園市桃園區忠孝街11號）" -> { city: 桃園市, town: 桃園區 }
// Normalises 台 -> 臺 first, then grabs the first XX市|XX縣 token followed by an
// optional …區|鄉|鎮|市 token.
function parseArea(location: string | null | undefined): {
  city: string | null; town: string | null;
} {
  if (!location) return { city: null, town: null };
  const normalized = location.replace(/台/g, '臺');
  const m = /(?<city>[^\s（(]{2}[市縣])(?<town>[^\s（(市縣]{1,3}?[區鄉鎮市])?/.exec(normalized);
  if (!m || !m.groups) return { city: null, town: null };
  return { city: m.groups.city ?? null, town: m.groups.town ?? null };
}

export function parse(body: Uint8Array, _src: SourceRow): RawMocEvent[] {
  const text = new TextDecoder().decode(body);
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error('moc_kids_events: expected a JSON array');
  }
  return data as RawMocEvent[];
}

export function normalize(records: unknown[], _src: SourceRow): {
  rows: NormalizedEvent[];
  rejected: Array<{ stage: string; sourceRecordId: string | null; message: string }>;
} {
  const rows: NormalizedEvent[] = [];
  const rejected: Array<{ stage: string; sourceRecordId: string | null; message: string }> = [];

  for (const raw of records) {
    const e = raw as RawMocEvent;
    const sourceId = e.UID;
    if (!sourceId) {
      rejected.push({ stage: 'normalize', sourceRecordId: null, message: 'missing UID' });
      continue;
    }
    const name = e.title ?? '';
    if (name.trim() === '') {
      rejected.push({ stage: 'normalize', sourceRecordId: sourceId, message: 'missing title' });
      continue;
    }

    const showInfo = Array.isArray(e.showInfo) ? e.showInfo : [];
    const occurrences: NormalizedEvent['occurrences'] = [];
    for (const s of showInfo) {
      const startsAt = twTime(s.time);
      if (!startsAt) continue;
      const { city, town } = parseArea(s.location);
      occurrences.push({
        starts_at: startsAt,
        ends_at: twTime(s.endTime) ?? null,
        venue_name: toI18n(s.locationName),
        address: toI18n(s.location),
        city_code: null,
        city_name: city,
        district_code: null,
        district_name: town,
        lat: s.latitude == null ? null : Number(s.latitude),
        lng: s.longitude == null ? null : Number(s.longitude),
        price_text: toI18n(s.price),
        ticket_url: null,
      });
    }

    if (occurrences.length === 0) {
      rejected.push({ stage: 'normalize', sourceRecordId: sourceId, message: 'no show with time' });
      continue;
    }

    const prices = [showInfo.map((s) => s.price ?? '').join(' '), e.discountInfo ?? ''].join(' ');
    const isFree = /免費/.test(prices) ? true : null;

    const categories: string[] = [];
    if (e.category) categories.push(e.category);
    categories.push('4');

    const imageUrl = e.imageUrl ?? '';
    const images = isHttpsUrl(imageUrl)
      ? [{ url: imageUrl, caption: {}, credit: (e as { sourceWebName?: string }).sourceWebName ?? null }]
      : [];

    const masterUnit = textArray(e.masterUnit);
    const organizer = masterUnit.length ? { 'zh-Hant': masterUnit.join('、') } : {};

    rows.push({
      source_id: sourceId,
      name: toI18n(name),
      description: toI18n(e.descriptionFilterHtml),
      source_categories: Array.from(new Set(categories)).sort(),
      tags: [],
      kid_tags: ['family'],
      kid_score: 80,
      status: 'scheduled',
      is_free: isFree,
      price_text: toI18n(e.discountInfo),
      organizer,
      website_url: e.sourceWebPromote?.trim() || null,
      ticket_url: e.webSales?.trim() || null,
      source_url: null,
      images,
      city_code: null,
      city_name: null,
      district_code: null,
      district_name: null,
      lat: null,
      lng: null,
      source_updated_at: twTime(e.editModifyDate),
      occurrences,
      raw: e,
    });
  }

  return { rows, rejected };
}
