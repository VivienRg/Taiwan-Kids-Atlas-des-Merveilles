-- Taiwan Kids Atlas — dev seed data
-- Idempotent: safe to re-run (on conflict do nothing). Sources and reference
-- data are seeded by migration 0300; this file only adds sample rows so the
-- API has content before the first ingestion run.
-- Run: psql "$DATABASE_URL" -f supabase/seed.sql

-- ---------------------------------------------------------------------------
-- Curated sample places (ids match data/activities.json slugs)
-- ---------------------------------------------------------------------------

insert into atlas.places (
  source, source_id, name, alt_names, description, address, postal_code,
  city_code, district_code, location, phone, website_url, source_categories,
  tags, kid_tags, kid_score, age_min, age_max, indoor_outdoor, is_free,
  price_level, fee_text, images, service_status, raw, content_hash,
  last_seen_at, last_seen_run_id
) values
  ('curated', 'xpark-aquarium-qingpu',
   '{"en":"Xpark Aquarium (Qingpu)","zh-Hant":"Xpark 水族館 (蘆竹)"}',
   '{}',
   '{"en":"Modern aquarium with immersive tanks, penguins, and shows—great A/C learning day.","zh-Hant":"現代水族館，企鵝與表演，適合冷氣室內學習。"}',
   '{"en":"No. 105, Chunde Rd, Zhongli District, Taoyuan City, Taiwan 320","zh-Hant":"桃園市蘆竹區 ChunDe 路 105 號"}',
   '320', '68000', '68000050',
   st_setsrid(st_makepoint(121.2199, 24.9627), 4326)::geography,
   null, 'https://xpark.com.tw/', '{"Aquarium","Science"}',
   '{"learning","nature","food","AC"}',
   '{"air_con","family","food","indoor","learning","nature"}', 100, 3, 12, 'indoor', false, 3,
   '{"en":"NT$600+","zh-Hant":"NT$600+"}'::jsonb,
   '[]'::jsonb, 'open',
   '{"seed":true}'::jsonb,
   md5('seed-xpark-aquarium-qingpu'), now(), null
) on conflict (source, source_id) do nothing;

insert into atlas.places (
  source, source_id, name, description, address, city_code, district_code,
  kid_tags, kid_score, age_min, age_max, indoor_outdoor, is_free, price_level,
  service_status, raw, content_hash, last_seen_at, last_seen_run_id
) values
  ('curated', 'hutoushan-park',
   '{"en":"Hutoushan Park","zh-Hant":"虎頭山公園"}',
   '{"en":"Trail and viewpoint overlooking the Taoyuan tableland.","zh-Hant":"俯瞰桃園台地的步道與景點。"}',
   '{"en":"Hutoushan, Taoyuan District, Taoyuan City","zh-Hant":"桃園市桃園區虎頭山"}',
   '68000', '68000010', '{"family","nature","outdoor","trail"}', 100, null, null,
   'outdoor', true, 0, 'open', '{"seed":true}'::jsonb,
   md5('seed-hutoushan-park'), now(), null
) on conflict (source, source_id) do nothing;

-- ---------------------------------------------------------------------------
-- Sample Tourism Administration attraction (mirrors one real record so the
-- API has an official-source place in dev before the first ingestion run).
-- ---------------------------------------------------------------------------

insert into atlas.places (
  source, source_id, name, description, address, postal_code, city_code,
  district_code, location, phone, source_categories, tags, kid_tags, kid_score,
  age_min, age_max, indoor_outdoor, is_free, price_level, fee_text,
  opening_hours, opening_hours_text, facilities, images, service_status,
  source_updated_at, raw, content_hash, last_seen_at, last_seen_run_id
) values
  ('tw_tourism_attractions', 'Attraction_379000000A_000351',
   '{"zh-Hant":"臺北市立兒童新樂園","en":"Taipei Children''s Amusement Park"}',
   '{"zh-Hant":"臺北市立兒童新樂園位於士林區，是臺北都會區代表性的親子主題樂園。"}',
   '{"zh-Hant":"臺北市士林區","en":"Shilin District, Taipei City"}',
   '111', '63000', '63000110',
   st_setsrid(st_makepoint(121.514947, 25.097239), 4326)::geography,
   '(02)28333823', '{"6","12","20","27"}', '{}',
   '{"family","playground","rides","diy","learning"}', 100, null, null, 'mixed',
   true, 0, '{}'::jsonb,
   null, '{}'::jsonb, '{}',
   '[{"url":"https://www.travel.taipei/content/images/attractions/573409/640x480_attractions-image-j5qokmrqwkevd5tcgnx48g.jpg","caption":{"zh-Hant":"遊樂設施：海盜船"},"credit":null}]'::jsonb,
  'open', '2026-06-10T16:15:22+08:00'::timestamptz, '{"seed":true}'::jsonb,
  md5('seed-taipei-childrens-park'), now(), null
) on conflict (source, source_id) do nothing;

-- ---------------------------------------------------------------------------
-- Sample event with one occurrence.
-- ---------------------------------------------------------------------------

insert into atlas.events (
  source, source_id, name, description, source_categories, category_slugs,
  kid_tags, kid_score, status, is_free, images, venue_name, address,
  city_code, district_code, location, source_updated_at, raw, content_hash,
  last_seen_at, last_seen_run_id
) values
  ('moc_kids_events', 'seed-moc-0001',
   '{"zh-Hant":"種子親子工作坊（範例）","en":"Seed kids workshop (sample)"}',
   '{"zh-Hant":"範例親子活動，供本機開發使用。"}',
   '{"4","7"}', '{"kids","workshop"}',
   '{"family"}', 80, 'scheduled', true,
   '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
   '68000', '68000010',
   st_setsrid(st_makepoint(121.3011, 24.9919), 4326)::geography,
   '2026-11-02T15:00:00+08:00'::timestamptz, '{"seed":true}'::jsonb,
   md5('seed-moc-0001'), now(), null
) on conflict (source, source_id) do nothing;

insert into atlas.event_occurrences (
  event_id, starts_at, ends_at, venue_name, address, city_code, district_code,
  location, price_text
)
select e.id, '2026-11-07T13:00:00+08:00'::timestamptz, '2026-11-07T15:00:00+08:00'::timestamptz,
       '{}'::jsonb, '{}'::jsonb, '68000', '68000010',
       st_setsrid(st_makepoint(121.3011, 24.9919), 4326)::geography,
       '{}'::jsonb
from atlas.events e
where e.source = 'moc_kids_events' and e.source_id = 'seed-moc-0001'
on conflict do nothing;
