// Adapter: tw_tourism_attractions — Tourism Administration Attraction-json.zip
// Docs: docs/data-sources.md §1, docs/ingestion.md §4.1.
// Full-snapshot zip, conditional GET (ETag / Last-Modified), one request per run.
import { fetchWithRetry, FetchResult } from '../http.ts';
import {
  parseZip, stripBom, toI18n, textArray, daymap, serviceStatus,
  priceLevel, isHttpsUrl, keywordCodes,
} from './_util.ts';
import { computeKidScore } from '../rules/kidScore.ts';
import type { SourceRow, NormalizedPlace, RunOpts } from '../types.ts';

export const id = 'tw_tourism_attractions';
const LIST_KEY = 'Attractions';
const CONNECT_TIMEOUT_MS = 10000;
const TOTAL_TIMEOUT_MS = 90000; // zip download

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

interface RawAttraction {
  AttractionID: string;
  AttractionName: string | null;
  AlternateNames: unknown[];
  Description: string | null;
  PositionLat: number | null;
  PositionLon: number | null;
  AttractionClasses: unknown[];
  PostalAddress: {
    City: string | null; CityCode: string | null; Town: string | null;
    TownCode: string | null; ZipCode: string | null; StreetAddress: string | null;
  } | null;
  Telephones: Array<{ Tel: string | null }> | null;
  WebsiteURL: string | null;
  ReservationURLs: string[] | null;
  Images: Array<{ Name: string | null; Description: string | null; URL: string | null }> | null;
  Facilities: unknown[];
  ServiceStatus: number | null;
  IsAccessibleForFree: number | null;
  FeeInfo: string | null;
  Tags: unknown[];
  UpdateTime: string | null;
  ServiceTimes?: Array<{ Name: string | null; ServiceDays: unknown[]; StartTime: string | null; EndTime: string | null; EffectiveDate: string | null; ExpireDate: string | null }>;
  Fees?: Array<{ Name: string | null; Price: number | null; Description: string | null; URL: string | null }>;
  ServiceTimeInfo: string | null;
  [key: string]: unknown;
}

export function parse(body: Uint8Array, src: SourceRow): RawAttraction[] {
  const zip = parseZip(body);
  const listMember = String(src.config.list_member ?? 'AttractionList.json');
  const stMember = String(src.config.service_time_member ?? 'AttractionServiceTimeList.json');
  const feeMember = String(src.config.fee_member ?? 'AttractionFeeList.json');

  const listText = stripBom(new TextDecoder().decode(zip[listMember]));
  const envelope = JSON.parse(listText);
  const records: RawAttraction[] = envelope[LIST_KEY] ?? [];

  const stText = zip[stMember]
    ? stripBom(new TextDecoder().decode(zip[stMember]))
    : null;
  const feeText = zip[feeMember]
    ? stripBom(new TextDecoder().decode(zip[feeMember]))
    : null;

  const stById = new Map<string, RawAttraction['ServiceTimes']>();
  if (stText) {
    const stEnv = JSON.parse(stText);
    for (const row of stEnv['AttractionServiceTimes'] ?? []) {
      stById.set(String(row.AttractionID), row.ServiceTimes);
    }
  }

  const feeById = new Map<string, RawAttraction['Fees']>();
  if (feeText) {
    const feeEnv = JSON.parse(feeText);
    for (const row of feeEnv['AttractionFees'] ?? []) {
      feeById.set(String(row.AttractionID), row.Fees);
    }
  }

  for (const a of records) {
    a.ServiceTimes = stById.get(a.AttractionID) ?? undefined;
    a.Fees = feeById.get(a.AttractionID) ?? undefined;
  }
  return records;
}

export function normalize(records: unknown[], _src: SourceRow): {
  rows: NormalizedPlace[];
  rejected: Array<{ stage: string; sourceRecordId: string | null; message: string; context?: Record<string, unknown> }>;
} {
  const rows: NormalizedPlace[] = [];
  const rejected: Array<{ stage: string; sourceRecordId: string | null; message: string }> = [];

  for (const raw of records) {
    const a = raw as RawAttraction;
    const sourceId = a.AttractionID;
    if (!sourceId) {
      rejected.push({ stage: 'normalize', sourceRecordId: null, message: 'missing AttractionID' });
      continue;
    }
    const name = a.AttractionName ?? '';
    if (name.trim() === '') {
      rejected.push({ stage: 'normalize', sourceRecordId: sourceId, message: 'missing name' });
      continue;
    }

    const classes = textArray(a.AttractionClasses);
    const kw = keywordCodes(name);
    const sourceCategories = [...classes, ...kw];
    const tags = textArray(a.Tags);
    const facilities = textArray(a.Facilities);
    const fees: Array<{ Name?: string | null; Price?: number | null }> =
      Array.isArray(a.Fees) ? a.Fees : [];

    const { score, kidTags: kidTagsFromRules } = computeKidScore({
      classes, name, description: a.Description, tags, facilities,
      isAccessibleForFree: a.IsAccessibleForFree, fees,
      serviceStatus: a.ServiceStatus,
    });

    // free tag per jq: IsAccessibleForFree == 1 or (fees exist and all Price == 0)
    const isFree =
      a.IsAccessibleForFree === 1 ? true
        : fees.length > 0 ? fees.every((f) => (f.Price ?? 0) === 0)
        : null;
    if (isFree === true && !kidTagsFromRules.includes('free')) {
      kidTagsFromRules.push('free');
    }

    const price = fees.length === 0 ? null
      : priceLevel(Math.max(...fees.map((f) => f.Price ?? 0)));
    const feeText = fees.length > 0
      ? { 'zh-Hant': fees.map((f) => `${f.Name ?? '費用'}：NT$${f.Price}`).join('；') }
      : (a.FeeInfo ? { 'zh-Hant': a.FeeInfo } : {});

    const addressParts = [
      a.PostalAddress?.City ?? '', a.PostalAddress?.Town ?? '',
      a.PostalAddress?.StreetAddress ?? '',
    ].join('');
    const images = (a.Images ?? [])
      .map((img) => ({
        url: img.URL ?? '',
        caption: toI18n(img.Name),
        credit: img.Description ?? null,
      }))
      .filter((img) => isHttpsUrl(img.url));

    const openingHours = a.ServiceTimes
      ? {
        periods: a.ServiceTimes.map((st) => ({
          days: (st.ServiceDays ?? []).map((d) => daymap(String(d))),
          opens: (st.StartTime ?? '').slice(0, 5),
          closes: (st.EndTime ?? '').slice(0, 5),
          label: toI18n(st.Name),
          valid_from: st.EffectiveDate ?? null,
          valid_to: st.ExpireDate ?? null,
        })),
      }
      : null;

    const cityCode = a.PostalAddress?.CityCode ?? null;
    const districtCode = a.PostalAddress?.TownCode ?? null;

    const row: NormalizedPlace = {
      source_id: sourceId,
      name: toI18n(name),
      alt_names: textArray(a.AlternateNames),
      description: toI18n(a.Description),
      address: addressParts ? { 'zh-Hant': addressParts } : {},
      postal_code: a.PostalAddress?.ZipCode ?? null,
      city_code: cityCode,
      city_name: a.PostalAddress?.City ?? null,
      district_code: districtCode,
      district_name: a.PostalAddress?.Town ?? null,
      lat: a.PositionLat ?? null,
      lng: a.PositionLon ?? null,
      phone: a.Telephones?.[0]?.Tel ?? null,
      website_url: a.WebsiteURL?.trim() || null,
      booking_url: a.ReservationURLs?.[0]?.trim() || null,
      source_url: null,
      source_categories: sourceCategories,
      tags,
      kid_tags: [...new Set(kidTagsFromRules)].sort(),
      kid_score: score,
      age_min: null,
      age_max: null,
      indoor_outdoor: null,
      is_free: isFree,
      price_level: price,
      fee_text: feeText,
      opening_hours: openingHours,
      opening_hours_text: toI18n(a.ServiceTimeInfo),
      facilities,
      images,
      service_status: serviceStatus(a.ServiceStatus),
      source_updated_at: a.UpdateTime ?? null,
      raw: a,
    };
    rows.push(row);
  }

  return { rows, rejected };
}
