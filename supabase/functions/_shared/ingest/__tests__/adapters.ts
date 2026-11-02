import { assertEquals, assertThrows } from '../vendor/test_helpers.ts';
import { zipSync, strToU8 } from '../vendor/fflate.mjs';
import {
  parse as parseAttractions, normalize as normAttractions,
} from '../adapters/ta_attractions.ts';
import { normalize as normEvents } from '../adapters/ta_events.ts';
import { parse as parseMoc, normalize as normMoc } from '../adapters/moc_events.ts';
import { normalize as normCurated } from '../adapters/curated.ts';
import type { SourceRow } from '../types.ts';

function fixture(name: string): unknown {
  return JSON.parse(Deno.readTextFileSync(`../../docs/data-sources/examples/${name}`));
}

function golden(name: string): unknown {
  return JSON.parse(Deno.readTextFileSync(`../../docs/ingestion/normalized-examples/${name}`));
}

const SRC_ATT: SourceRow = {
  id: 'tw_tourism_attractions', kind: 'place',
  config: {
    list_member: 'AttractionList.json',
    service_time_member: 'AttractionServiceTimeList.json',
    fee_member: 'AttractionFeeList.json',
    batch_size: 500,
  },
} as unknown as SourceRow;

// Drop nulls so the comparison matches the jq reference output, which simply
// omits keys the prototype never sets (age_min, age_max, indoor_outdoor,
// linked, …) while keeping explicit nulls where jq emits them (is_free,
// price_level). Both sides are normalized identically.
function forCompare(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(forCompare);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === null || val === undefined || k === 'raw') continue;
      o[k] = forCompare(val);
    }
    return o;
  }
  return v;
}
function eq(actual: unknown, expected: unknown): void {
  assertEquals(forCompare(actual), forCompare(expected));
}

const SRC_OTHER = { id: 'tw_tourism_events', kind: 'event', config: {} } as unknown as SourceRow;

function zipMembers(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(files)) {
    entries[name] = strToU8(text);
  }
  return zipSync(entries);
}

export function runAdapterTests(): void {
  // parse: unzips, strips BOM, joins service times and fees
  {
    const list = JSON.stringify(fixture('tw_tourism_attractions.AttractionList.sample.json'));
    const st = JSON.stringify(fixture('tw_tourism_attractions.AttractionServiceTimeList.sample.json'));
    const fees = JSON.stringify(fixture('tw_tourism_attractions.AttractionFeeList.sample.json'));
    const records = parseAttractions(zipMembers({
      'AttractionList.json': list,
      'AttractionServiceTimeList.json': st,
      'AttractionFeeList.json': fees,
    }), SRC_ATT);
    assertEquals(records.length, 2);
    assertEquals((records[0] as { AttractionID: string }).AttractionID,
      'Attraction_345040000G_000001');
    assertEquals((records[1] as { AttractionID: string }).AttractionID,
      'Attraction_379000000A_000351');
    assertEquals((records[0] as { ServiceTimes: unknown[] }).ServiceTimes.length, 2);
    assertEquals((records[0] as { Fees?: unknown[] }).Fees, undefined);
    assertEquals((records[1] as { Fees?: unknown[] }).Fees, undefined);
  }

  // normalize: golden record matches the verified jq reference normaliser
  {
    const env = fixture('tw_tourism_attractions.AttractionList.sample.json') as { Attractions: unknown[] };
    const stEnv = fixture('tw_tourism_attractions.AttractionServiceTimeList.sample.json') as {
      AttractionServiceTimes: unknown[];
    };
    const feeEnv = fixture('tw_tourism_attractions.AttractionFeeList.sample.json') as {
      AttractionFees: unknown[];
    };
    const stById = new Map(stEnv.AttractionServiceTimes.map((r: unknown) => [
      (r as { AttractionID: string }).AttractionID,
      (r as { ServiceTimes: unknown[] }).ServiceTimes,
    ]));
    const feeById = new Map(feeEnv.AttractionFees.map((r: unknown) => [
      (r as { AttractionID: string }).AttractionID,
      (r as { Fees: unknown[] }).Fees,
    ]));
    const records = env.Attractions.map((a) => ({
      ...(a as Record<string, unknown>),
      ServiceTimes: stById.get((a as { AttractionID: string }).AttractionID),
      Fees: feeById.get((a as { AttractionID: string }).AttractionID),
    }));
    const { rows } = normAttractions(records, SRC_ATT);
    assertEquals(rows.length, 2);
    const byId = new Map(rows.map((r) => [r.source_id, r]));
    eq(byId.get('Attraction_379000000A_000351'), golden('place.tw_tourism_attractions.json'));

    const r3450 = byId.get('Attraction_345040000G_000001');
    if (!r3450) throw new Error('expected Attraction_345040000G_000001');
    assertEquals(r3450.kid_score, 30);
    assertEquals(r3450.kid_tags, ['animals', 'nature']);
    assertEquals(r3450.source_categories, ['16']);
    assertEquals(r3450.opening_hours?.periods.length, 2);
    assertEquals(r3450.opening_hours?.periods[0], {
      days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      opens: '06:00', closes: '20:00',
      label: { 'zh-Hant': '平日（星期一~星期五）及寒假期間平日' },
      valid_from: null, valid_to: null,
    });
    assertEquals(r3450.images?.length, 2);
    assertEquals(r3450.images?.[0].url.startsWith('https://'), true);
  }

  // normalize: rejects rows without id or name
  {
    const { rows, rejected } = normAttractions([
      { AttractionName: 'ok' },                      // missing id
      { AttractionID: 'x', AttractionName: '' },     // blank name
      { AttractionID: 'y', AttractionName: 'valid' }, // valid
    ], SRC_ATT);
    assertEquals(rows.length, 1);
    assertEquals(rows[0].source_id, 'y');
    assertEquals(rejected.length, 2);
  }

  // ta_events.normalize: golden record matches reference normaliser
  {
    const env = fixture('tw_tourism_events.EventList.sample.json') as { Events: unknown[] };
    const { rows } = normEvents(env.Events, SRC_OTHER);
    assertEquals(rows.length, 1);
    eq(rows[0], golden('event.tw_tourism_events.json'));
  }

  // ta_events.normalize: requires occurrences with starts_at
  {
    const { rows, rejected } = normEvents([
      { EventID: 'a', EventName: 'no shows', StartDateTime: null, EndDateTime: null },
      { EventID: 'b', EventName: 'valid', StartDateTime: '2026-01-01T00:00:00+08:00' },
    ], SRC_OTHER);
    assertEquals(rows.length, 1);
    assertEquals(rows[0].source_id, 'b');
    assertEquals(rejected.length, 1);
  }

  // moc_kids_events.normalize: golden record matches reference normaliser
  {
    const records = fixture('moc_kids_events.category4.sample.json') as unknown[];
    const { rows } = normMoc(records, SRC_OTHER);
    assertEquals(rows.length, 2);
    eq(rows[0], golden('event.moc_kids_events.json'));
    // source_categories from jq unique => sorted
    assertEquals(rows[0].source_categories, ['4', '7']);
  }

  // moc_kids_events.normalize: drops shows without time, rejects empty events
  {
    const { rows, rejected } = normMoc([
      { UID: 'a', title: 'empty', showInfo: [{ endTime: '2026/11/07 13:00:00' }] },
      { UID: 'b', title: 'ok', showInfo: [{ time: '2026/11/07 13:00:00', endTime: '2026/11/07 15:00:00' }] },
    ], SRC_OTHER);
    assertEquals(rows.length, 1);
    assertEquals(rows[0].occurrences.length, 1);
    assertEquals(rejected.length, 1);
  }

  // moc_kids_events.parse: rejects non-array payload
  {
    assertThrows(() => parseMoc(new TextEncoder().encode(JSON.stringify({ not: 'an array' })), SRC_OTHER));
  }

  // curated.normalize: trailing "(中文)" becomes name['zh-Hant'] (ingestion.md §4.3).
  // Regression guard: the JS regex needs both the u flag and the Script= prefix,
  // otherwise 36 of the 87 curated names kept the Chinese inside their English name.
  {
    const SRC_CURATED = { id: 'curated', kind: 'place', config: {} } as unknown as SourceRow;
    const activity = (id: string, name: string) => ({
      id, name, region: 'north', city: 'Taoyuan', district: 'Taoyuan',
      indoor_outdoor: 'outdoor', categories: ['Park'], tags: [], cost_range: '0',
      age_range: [3, 12], natural: true, desc: 'x', website: '', map_link: '',
      drive_min: 10, address_en: 'addr', address_query: 'q',
    });
    const { rows } = normCurated([
      activity('t-split', 'Hutoushan Park (虎頭山)'),
      activity('t-nosplit', 'Xpark Aquarium (Qingpu)'),
      activity('t-mid', 'Lalashan (拉拉山) Forest Drive viewpoint'),
    ], SRC_CURATED);
    assertEquals(rows.length, 3);
    const nameById = new Map(rows.map((r) => [r.source_id, r.name]));
    assertEquals(nameById.get('t-split'), { en: 'Hutoushan Park', 'zh-Hant': '虎頭山' });
    assertEquals(nameById.get('t-nosplit'), { en: 'Xpark Aquarium (Qingpu)' });
    // Only a trailing parenthesised group is split (jq reference behaviour).
    assertEquals(nameById.get('t-mid'), { en: 'Lalashan (拉拉山) Forest Drive viewpoint' });
  }

  console.log('ok  adapter tests');
}
