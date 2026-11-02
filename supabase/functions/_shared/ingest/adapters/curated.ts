// Adapter: curated — original project data/activities.json (file-based import,
// CLI only, no schedule). Docs: docs/data-sources.md §7, docs/ingestion.md §4.3.
import { toI18n, textArray } from './_util.ts';
import type { Adapter, SourceRow, NormalizedPlace } from '../types.ts';

export const id = 'curated';

const KIDTAG_MAP: Record<string, string> = {
  AC: 'air_con', ac: 'air_con', active: 'active',
  'dog friendly': 'dog_friendly', food: 'food', snacks: 'food',
  learning: 'learning', nature: 'nature', stroller: 'stroller_friendly',
  waterplay: 'water_play', splash: 'water_play', pool: 'water_play',
  rides: 'rides', seasonal: 'seasonal', creative: 'diy', DIY: 'diy',
  ceramics: 'diy', free: 'free', shade: 'shade', indoor: 'indoor',
};

const PRICE_LEVEL: Record<string, 0 | 1 | 2 | 3 | null> = {
  '0': 0, '1–200': 1, '200–600': 2, '600+': 3,
};

interface RawActivity {
  id: string; name: string; region?: string; city: string; district: string;
  indoor_outdoor: string; categories: string[]; tags: string[];
  cost_range: string; age_range: [number, number] | null; natural: boolean;
  desc: string; website: string; map_link: string; drive_min: number;
  address_en: string; address_query: string;
}

async function readJson(path: string): Promise<unknown> {
  const text = await Deno.readTextFile(repoPath(path));
  return JSON.parse(text);
}

// Repository-root-relative path resolution. Source config paths like
// "data/activities.json" are relative to the repo root, while the worker runs
// from supabase/functions.
const REPO_ROOT = new URL('../../../../..', import.meta.url);

function repoPath(p: string): string {
  if (p.startsWith('/') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(p)) return p;
  return new URL(p, REPO_ROOT).pathname;
}

export async function request(src: SourceRow): Promise<{
  status: number; etag: null; lastModified: null; body: Uint8Array;
}> {
  const path = repoPath(String(src.config.path ?? '../../data/activities.json'));
  const text = await Deno.readTextFile(path);
  const activities = JSON.parse(text) as RawActivity[];
  const body = new TextEncoder().encode(JSON.stringify(activities));
  return { status: 200, etag: null, lastModified: null, body };
}

export function parse(body: Uint8Array, _src: SourceRow): RawActivity[] {
  return JSON.parse(new TextDecoder().decode(body)) as RawActivity[];
}

function splitName(name: string): { en: string; zh?: string } {
  const m = /^(?<en>.*?)\s*\((?<zh>[^)]*\p{Han}[^)]*)\)\s*$/.exec(name);
  if (!m || !m.groups) return { en: name.trim(), zh: undefined };
  const en = m.groups.en.trim();
  const zh = m.groups.zh.trim();
  return { en, zh };
}

export function normalize(records: unknown[], src: SourceRow): {
  rows: NormalizedPlace[];
  rejected: Array<{ stage: string; sourceRecordId: string | null; message: string }>;
} {
  const rows: NormalizedPlace[] = [];
  const rejected: Array<{ stage: string; sourceRecordId: string | null; message: string }> = [];

  const linksPath = String(src.config.links_path ?? '../../data/curated_links.json');
  let links: Record<string, string> = {};
  try {
    links = JSON.parse(new TextDecoder().decode(Deno.readFileSync(repoPath(linksPath)))) as Record<string, string>;
  } catch {
    links = {};
  }

  for (const raw of records) {
    const a = raw as RawActivity;
    const sourceId = a.id;
    if (!sourceId) {
      rejected.push({ stage: 'normalize', sourceRecordId: null, message: 'missing id' });
      continue;
    }
    const name = a.name?.trim();
    if (!name) {
      rejected.push({ stage: 'normalize', sourceRecordId: sourceId, message: 'missing name' });
      continue;
    }

    const { en, zh } = splitName(name);
    const i18nName: Record<string, string> = { en };
    if (zh) i18nName['zh-Hant'] = zh;

    const tags = textArray(a.tags);
    const kidTags: string[] = ['family'];
    for (const t of tags) {
      const mapped = KIDTAG_MAP[t];
      if (mapped) kidTags.push(mapped);
    }
    if ((a.categories ?? []).includes('Seasonal')) kidTags.push('seasonal');
    const io = (a.indoor_outdoor ?? '').toLowerCase();
    if (io === 'indoor') kidTags.push('indoor');
    else if (io === 'outdoor') kidTags.push('outdoor');
    if (a.cost_range === '0') kidTags.push('free');

    const isFree = a.cost_range === '0' ? true : a.cost_range === '' ? null : false;
    const feeText = a.cost_range === '' ? {}
      : a.cost_range === '0' ? { en: 'Free', 'zh-Hant': '免費' }
      : { en: `NT$${a.cost_range}` };

    rows.push({
      source_id: sourceId,
      name: i18nName,
      alt_names: [],
      description: a.desc ? { en: a.desc } : {},
      address: a.address_en ? { en: a.address_en } : {},
      postal_code: null,
      city_code: null,
      city_name: a.city ?? null,
      district_code: null,
      district_name: a.district ?? null,
      lat: null,
      lng: null,
      phone: null,
      website_url: a.website?.trim() || null,
      booking_url: null,
      source_url: null,
      source_categories: textArray(a.categories),
      tags,
      kid_tags: [...new Set(kidTags)].sort(),
      kid_score: 100,
      age_min: a.age_range?.[0] ?? null,
      age_max: a.age_range?.[1] ?? null,
      indoor_outdoor: io || null,
      is_free: isFree,
      price_level: PRICE_LEVEL[a.cost_range] ?? null,
      fee_text: feeText,
      opening_hours: null,
      opening_hours_text: {},
      facilities: [],
      images: [],
      service_status: 'open',
      linked: links[sourceId]
        ? { source: 'tw_tourism_attractions', source_id: links[sourceId] }
        : null,
      source_updated_at: null,
      raw: a,
    });
  }

  return { rows, rejected: rejected as never };
}
