-- Taiwan Kids Atlas — migration 0300: reference data
-- Sources, cities (+ English names for the original project's core districts),
-- app categories, and source-code -> category mappings.
-- Reference data is required for correctness, so it lives in a migration (idempotent upserts),
-- not in seed.sql. Dev sample places/events belong in supabase/seed.sql.

-- ---------------------------------------------------------------------------
-- Sources (see docs/data-sources.md for verification evidence)
-- ---------------------------------------------------------------------------

insert into atlas.sources
  (id, kind, name, publisher, homepage_url, dataset_url, license, license_url, attribution,
   enabled, is_full_snapshot, schedule_cron, min_keep_ratio, config)
values
  ('tw_tourism_attractions', 'place',
   '{"zh-Hant":"景點－觀光資訊資料庫","en":"Attractions — Tourism Information Database"}',
   '{"zh-Hant":"交通部觀光署","en":"Tourism Administration, MOTC"}',
   'https://data.gov.tw/dataset/7777',
   'https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Attraction-json.zip',
   'OGDL-Taiwan-1.0', 'https://data.gov.tw/license',
   '{"zh-Hant":"交通部觀光署 景點－觀光資訊資料庫（觀光資料標準V2.1）。此開放資料依政府資料開放授權條款 (Open Government Data License) 進行公眾釋出，使用者於遵守本條款各項規定之前提下，得利用之。政府資料開放授權條款：https://data.gov.tw/license","en":"Tourism Administration, MOTC — Attractions, Tourism Information Database (Tourism Data Standard V2.1). Released under the Open Government Data License, version 1.0: https://data.gov.tw/license"}',
   true, true, '15 8,14 * * *', 0.80,
   '{"url":"https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Attraction-json.zip","list_member":"AttractionList.json","service_time_member":"AttractionServiceTimeList.json","fee_member":"AttractionFeeList.json","batch_size":500}'),

  ('tw_tourism_events', 'event',
   '{"zh-Hant":"活動－觀光資訊資料庫","en":"Events — Tourism Information Database"}',
   '{"zh-Hant":"交通部觀光署","en":"Tourism Administration, MOTC"}',
   'https://data.gov.tw/dataset/7778',
   'https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Event-json.zip',
   'OGDL-Taiwan-1.0', 'https://data.gov.tw/license',
   '{"zh-Hant":"交通部觀光署 活動－觀光資訊資料庫（觀光資料標準V2.1）。此開放資料依政府資料開放授權條款 (Open Government Data License) 進行公眾釋出，使用者於遵守本條款各項規定之前提下，得利用之。政府資料開放授權條款：https://data.gov.tw/license","en":"Tourism Administration, MOTC — Events, Tourism Information Database (Tourism Data Standard V2.1). Released under the Open Government Data License, version 1.0: https://data.gov.tw/license"}',
   true, true, '25 8,14 * * *', 0.50,
   '{"url":"https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Event-json.zip","list_member":"EventList.json","batch_size":500}'),

  ('moc_kids_events', 'event',
   '{"zh-Hant":"藝文活動（親子類）","en":"Arts & culture events — Family category"}',
   '{"zh-Hant":"文化部","en":"Ministry of Culture"}',
   'https://data.gov.tw/dataset/10042',
   'https://cloud.culture.tw/frontsite/opendata/activityOpenDataJsonAction.do?method=doFindActivitiesByCategory&category=4',
   'OGDL-Taiwan-1.0', 'https://data.gov.tw/license',
   '{"zh-Hant":"文化部 查詢單一類別未過期活動資料（親子類）。此開放資料依政府資料開放授權條款 (Open Government Data License) 進行公眾釋出，使用者於遵守本條款各項規定之前提下，得利用之。政府資料開放授權條款：https://data.gov.tw/license","en":"Ministry of Culture — current arts events, Family category. Released under the Open Government Data License, version 1.0: https://data.gov.tw/license"}',
   true, true, '40 8,14 * * *', 0.50,
   '{"url":"https://cloud.culture.tw/frontsite/opendata/activityOpenDataJsonAction.do?method=doFindActivitiesByCategory&category=4","timezone":"Asia/Taipei","batch_size":200}'),

  ('taipei_travel_attractions', 'place',
   '{"zh-Hant":"臺北旅遊網 景點","en":"Taipei Travel — Attractions"}',
   '{"zh-Hant":"臺北市政府觀光傳播局","en":"Department of Information and Tourism, Taipei City Government"}',
   'https://www.travel.taipei/open-api/swagger/ui/index#/Attractions/Attractions_All',
   'https://www.travel.taipei/open-api/{lang}/Attractions/All?page={n}',
   'OGDL-Taiwan-1.0', 'https://data.gov.tw/license',
   '{"zh-Hant":"臺北市政府觀光傳播局 臺北旅遊網 Open API－景點。此開放資料依政府資料開放授權條款 (Open Government Data License) 進行公眾釋出，使用者於遵守本條款各項規定之前提下，得利用之。政府資料開放授權條款：https://data.gov.tw/license","en":"Department of Information and Tourism, Taipei City Government — Taipei Travel Open API, Attractions. Released under the Open Government Data License, version 1.0: https://data.gov.tw/license"}',
   -- DISABLED: data endpoints sit behind a Cloudflare managed challenge (HTTP 403,
   -- cf-mitigated: challenge) for non-browser clients as of 2026-11-02. See ADR-0003.
   false, true, '0 9 * * 1', 0.80,
   '{"base_url":"https://www.travel.taipei/open-api","langs":["zh-tw","en","ja","ko"],"page_size":30,"min_interval_ms":1000}'),

  ('taipei_travel_events', 'event',
   '{"zh-Hant":"臺北旅遊網 活動展演","en":"Taipei Travel — Events"}',
   '{"zh-Hant":"臺北市政府觀光傳播局","en":"Department of Information and Tourism, Taipei City Government"}',
   'https://www.travel.taipei/open-api/swagger/ui/index#/Events/Events_Activity',
   'https://www.travel.taipei/open-api/{lang}/Events/Activity?page={n}',
   'OGDL-Taiwan-1.0', 'https://data.gov.tw/license',
   '{"zh-Hant":"臺北市政府觀光傳播局 臺北旅遊網 Open API－活動展演。此開放資料依政府資料開放授權條款 (Open Government Data License) 進行公眾釋出，使用者於遵守本條款各項規定之前提下，得利用之。政府資料開放授權條款：https://data.gov.tw/license","en":"Department of Information and Tourism, Taipei City Government — Taipei Travel Open API, Events. Released under the Open Government Data License, version 1.0: https://data.gov.tw/license"}',
   false, true, '10 9 * * 1', 0.50,
   '{"base_url":"https://www.travel.taipei/open-api","langs":["zh-tw","en"],"page_size":30,"min_interval_ms":1000}'),

  ('curated', 'place',
   '{"en":"Taiwan Kids Atlas curated activities","zh-Hant":"Taiwan Kids Atlas 精選親子景點"}',
   '{"en":"Taiwan Kids Atlas des Merveilles contributors","zh-Hant":"Taiwan Kids Atlas des Merveilles 貢獻者"}',
   'https://github.com/VivienRg/Taiwan-Kids-Atlas-des-Merveilles',
   'https://github.com/VivienRg/Taiwan-Kids-Atlas-des-Merveilles/blob/main/data/activities.json',
   'MIT', 'https://opensource.org/licenses/MIT',
   '{"en":"Curated by the Taiwan Kids Atlas des Merveilles community.","zh-Hant":"由 Taiwan Kids Atlas des Merveilles 社群整理。"}',
   true, true, null, 0.50,
   '{"path":"data/activities.json","links_path":"data/curated_links.json"}')
on conflict (id) do update set
  kind = excluded.kind, name = excluded.name, publisher = excluded.publisher,
  homepage_url = excluded.homepage_url, dataset_url = excluded.dataset_url,
  license = excluded.license, license_url = excluded.license_url,
  attribution = excluded.attribution, is_full_snapshot = excluded.is_full_snapshot,
  config = excluded.config;
-- NOTE: enabled / schedule_cron / min_keep_ratio are operator-owned after first insert
-- and deliberately not overwritten on re-run.

-- ---------------------------------------------------------------------------
-- Cities (MOI codes as used by the Tourism Data Standard PostalAddress.CityCode)
-- ---------------------------------------------------------------------------

insert into atlas.admin_areas (code, level, parent_code, name, sort) values
  ('10017', 'city', null, '{"zh-Hant":"基隆市","en":"Keelung City"}', 10),
  ('63000', 'city', null, '{"zh-Hant":"臺北市","en":"Taipei City"}', 20),
  ('65000', 'city', null, '{"zh-Hant":"新北市","en":"New Taipei City"}', 30),
  ('68000', 'city', null, '{"zh-Hant":"桃園市","en":"Taoyuan City"}', 40),
  ('10018', 'city', null, '{"zh-Hant":"新竹市","en":"Hsinchu City"}', 50),
  ('10004', 'city', null, '{"zh-Hant":"新竹縣","en":"Hsinchu County"}', 60),
  ('10005', 'city', null, '{"zh-Hant":"苗栗縣","en":"Miaoli County"}', 70),
  ('66000', 'city', null, '{"zh-Hant":"臺中市","en":"Taichung City"}', 80),
  ('10007', 'city', null, '{"zh-Hant":"彰化縣","en":"Changhua County"}', 90),
  ('10008', 'city', null, '{"zh-Hant":"南投縣","en":"Nantou County"}', 100),
  ('10009', 'city', null, '{"zh-Hant":"雲林縣","en":"Yunlin County"}', 110),
  ('10020', 'city', null, '{"zh-Hant":"嘉義市","en":"Chiayi City"}', 120),
  ('10010', 'city', null, '{"zh-Hant":"嘉義縣","en":"Chiayi County"}', 130),
  ('67000', 'city', null, '{"zh-Hant":"臺南市","en":"Tainan City"}', 140),
  ('64000', 'city', null, '{"zh-Hant":"高雄市","en":"Kaohsiung City"}', 150),
  ('10013', 'city', null, '{"zh-Hant":"屏東縣","en":"Pingtung County"}', 160),
  ('10002', 'city', null, '{"zh-Hant":"宜蘭縣","en":"Yilan County"}', 170),
  ('10015', 'city', null, '{"zh-Hant":"花蓮縣","en":"Hualien County"}', 180),
  ('10014', 'city', null, '{"zh-Hant":"臺東縣","en":"Taitung County"}', 190),
  ('10016', 'city', null, '{"zh-Hant":"澎湖縣","en":"Penghu County"}', 200),
  ('09020', 'city', null, '{"zh-Hant":"金門縣","en":"Kinmen County"}', 210),
  ('09007', 'city', null, '{"zh-Hant":"連江縣","en":"Lienchiang County"}', 220)
on conflict (code) do update set name = excluded.name, sort = excluded.sort;

-- Districts of the original project's core area (Taoyuan, Taipei, Hsinchu City) with English
-- names. Every other district is created by ingestion with its zh-Hant name only.
insert into atlas.admin_areas (code, level, parent_code, name, sort) values
  ('68000010', 'district', '68000', '{"zh-Hant":"桃園區","en":"Taoyuan District"}', 10),
  ('68000020', 'district', '68000', '{"zh-Hant":"中壢區","en":"Zhongli District"}', 20),
  ('68000030', 'district', '68000', '{"zh-Hant":"大溪區","en":"Daxi District"}', 30),
  ('68000040', 'district', '68000', '{"zh-Hant":"楊梅區","en":"Yangmei District"}', 40),
  ('68000050', 'district', '68000', '{"zh-Hant":"蘆竹區","en":"Luzhu District"}', 50),
  ('68000060', 'district', '68000', '{"zh-Hant":"大園區","en":"Dayuan District"}', 60),
  ('68000070', 'district', '68000', '{"zh-Hant":"龜山區","en":"Guishan District"}', 70),
  ('68000080', 'district', '68000', '{"zh-Hant":"八德區","en":"Bade District"}', 80),
  ('68000090', 'district', '68000', '{"zh-Hant":"龍潭區","en":"Longtan District"}', 90),
  ('68000100', 'district', '68000', '{"zh-Hant":"平鎮區","en":"Pingzhen District"}', 100),
  ('68000110', 'district', '68000', '{"zh-Hant":"新屋區","en":"Xinwu District"}', 110),
  ('68000120', 'district', '68000', '{"zh-Hant":"觀音區","en":"Guanyin District"}', 120),
  ('68000130', 'district', '68000', '{"zh-Hant":"復興區","en":"Fuxing District"}', 130),
  ('63000010', 'district', '63000', '{"zh-Hant":"松山區","en":"Songshan District"}', 10),
  ('63000020', 'district', '63000', '{"zh-Hant":"信義區","en":"Xinyi District"}', 20),
  ('63000030', 'district', '63000', '{"zh-Hant":"大安區","en":"Da''an District"}', 30),
  ('63000040', 'district', '63000', '{"zh-Hant":"中山區","en":"Zhongshan District"}', 40),
  ('63000050', 'district', '63000', '{"zh-Hant":"中正區","en":"Zhongzheng District"}', 50),
  ('63000060', 'district', '63000', '{"zh-Hant":"大同區","en":"Datong District"}', 60),
  ('63000070', 'district', '63000', '{"zh-Hant":"萬華區","en":"Wanhua District"}', 70),
  ('63000080', 'district', '63000', '{"zh-Hant":"文山區","en":"Wenshan District"}', 80),
  ('63000090', 'district', '63000', '{"zh-Hant":"南港區","en":"Nangang District"}', 90),
  ('63000100', 'district', '63000', '{"zh-Hant":"內湖區","en":"Neihu District"}', 100),
  ('63000110', 'district', '63000', '{"zh-Hant":"士林區","en":"Shilin District"}', 110),
  ('63000120', 'district', '63000', '{"zh-Hant":"北投區","en":"Beitou District"}', 120),
  ('10018010', 'district', '10018', '{"zh-Hant":"東區","en":"East District"}', 10),
  ('10018020', 'district', '10018', '{"zh-Hant":"北區","en":"North District"}', 20),
  ('10018030', 'district', '10018', '{"zh-Hant":"香山區","en":"Xiangshan District"}', 30)
on conflict (code) do update set name = atlas.admin_areas.name || excluded.name, sort = excluded.sort;

-- ---------------------------------------------------------------------------
-- App categories. Derived from the original web app's categories (data/categories.txt),
-- consolidated to a filterable set. Icons match the original getCategoryEmoji() spirit.
-- ---------------------------------------------------------------------------

insert into atlas.categories (slug, name, icon, applies_to, sort) values
  ('animals',     '{"en":"Zoos, aquariums & animals","zh-Hant":"動物與水族"}', '🦁', '{place}', 10),
  ('playground',  '{"en":"Playgrounds & indoor play","zh-Hant":"遊戲場與室內遊樂"}', '🛝', '{place}', 20),
  ('theme-park',  '{"en":"Theme parks & rides","zh-Hant":"主題樂園"}', '🎢', '{place}', 30),
  ('museum',      '{"en":"Museums & art","zh-Hant":"博物館與藝術"}', '🏛️', '{place}', 40),
  ('science',     '{"en":"Science & learning","zh-Hant":"科學探索"}', '🔬', '{place}', 50),
  ('library',     '{"en":"Libraries & books","zh-Hant":"圖書館"}', '📚', '{place}', 60),
  ('park',        '{"en":"Parks & gardens","zh-Hant":"公園綠地"}', '🌳', '{place}', 70),
  ('nature',      '{"en":"Nature & scenery","zh-Hant":"自然風景"}', '⛰️', '{place}', 80),
  ('trail',       '{"en":"Trails & bike paths","zh-Hant":"步道與自行車道"}', '🚴', '{place}', 90),
  ('water',       '{"en":"Beaches & water play","zh-Hant":"海灘與玩水"}', '🏖️', '{place}', 100),
  ('farm',        '{"en":"Farms & fruit picking","zh-Hant":"休閒農場"}', '🌾', '{place}', 110),
  ('diy',         '{"en":"DIY & factory tours","zh-Hant":"手作與觀光工廠"}', '🎨', '{place}', 120),
  ('culture',     '{"en":"Culture & history","zh-Hant":"文化歷史"}', '🏮', '{place,event}', 130),
  ('market',      '{"en":"Markets & old streets","zh-Hant":"老街與市集"}', '🛍️', '{place,event}', 140),
  ('sports',      '{"en":"Sports & active fun","zh-Hant":"運動體能"}', '⚽', '{place,event}', 150),
  ('hot-spring',  '{"en":"Hot springs","zh-Hant":"溫泉"}', '♨️', '{place}', 160),
  ('temple',      '{"en":"Temples","zh-Hant":"宗教廟宇"}', '🛕', '{place}', 170),
  ('transport',   '{"en":"Trains & stations","zh-Hant":"鐵道與車站"}', '🚂', '{place}', 180),
  ('kids',        '{"en":"Family & kids shows","zh-Hant":"親子活動"}', '🧸', '{event}', 5),
  ('performance', '{"en":"Performances & concerts","zh-Hant":"表演與音樂會"}', '🎭', '{event}', 210),
  ('exhibition',  '{"en":"Exhibitions","zh-Hant":"展覽"}', '🖼️', '{event}', 220),
  ('workshop',    '{"en":"Workshops & talks","zh-Hant":"工作坊與講座"}', '✏️', '{event}', 230),
  ('festival',    '{"en":"Festivals","zh-Hant":"節慶活動"}', '🎉', '{event}', 240),
  ('movie',       '{"en":"Movies","zh-Hant":"電影"}', '🎬', '{event}', 250),
  ('other',       '{"en":"Other","zh-Hant":"其他"}', '📍', '{place,event}', 999)
on conflict (slug) do update set
  name = excluded.name, icon = excluded.icon, applies_to = excluded.applies_to, sort = excluded.sort;

-- ---------------------------------------------------------------------------
-- Category mappings
-- ---------------------------------------------------------------------------

-- Tourism Data Standard V2 AttractionClassEnum (觀光資料標準V2.0 §附錄 14)
insert into atlas.category_mappings (source, source_code, category_slug) values
  ('tw_tourism_attractions', '1', 'culture'),      -- 文化類
  ('tw_tourism_attractions', '2', 'nature'),       -- 生態類
  ('tw_tourism_attractions', '3', 'culture'),      -- 文化資產類
  ('tw_tourism_attractions', '4', 'temple'),       -- 宗教廟宇類
  ('tw_tourism_attractions', '5', 'museum'),       -- 藝術類
  ('tw_tourism_attractions', '6', 'market'),       -- 商圈商店類
  ('tw_tourism_attractions', '7', 'nature'),       -- 國家公園類
  ('tw_tourism_attractions', '8', 'nature'),       -- 國家風景區類
  ('tw_tourism_attractions', '9', 'farm'),         -- 休閒農業類
  ('tw_tourism_attractions', '10', 'hot-spring'),  -- 溫泉類
  ('tw_tourism_attractions', '11', 'nature'),      -- 自然風景類
  ('tw_tourism_attractions', '12', 'park'),        -- 遊憩類
  ('tw_tourism_attractions', '13', 'sports'),      -- 體育健身類
  ('tw_tourism_attractions', '13', 'trail'),
  ('tw_tourism_attractions', '14', 'diy'),         -- 觀光工廠類
  ('tw_tourism_attractions', '15', 'park'),        -- 都會公園類
  ('tw_tourism_attractions', '16', 'nature'),      -- 森林遊樂區類
  ('tw_tourism_attractions', '16', 'trail'),
  ('tw_tourism_attractions', '17', 'park'),        -- 平地森林園區類
  -- '18' 國家自然公園類 deliberately unmapped: providers misuse it (stations, malls, schools in the
  -- 2026-11-02 file). Name keywords below give better signal.
  ('tw_tourism_attractions', '19', 'park'),        -- 公園綠地類
  ('tw_tourism_attractions', '20', 'theme-park'),  -- 觀光遊樂業類
  ('tw_tourism_attractions', '21', 'culture'),     -- 原住民文化類
  ('tw_tourism_attractions', '22', 'culture'),     -- 客家文化類
  ('tw_tourism_attractions', '23', 'transport'),   -- 交通場站類
  ('tw_tourism_attractions', '24', 'water'),       -- 水域環境類
  ('tw_tourism_attractions', '25', 'museum'),      -- 藝文場館類
  ('tw_tourism_attractions', '26', 'animals'),     -- 生態場館類 (zoo, aquarium, eco centre)
  ('tw_tourism_attractions', '27', 'playground'),  -- 娛樂場館類
  ('tw_tourism_attractions', '254', 'other')       -- 其他
on conflict do nothing;

-- Name-keyword categories: the normaliser emits "kw:<slug>" codes from attraction names
-- (rules in docs/ingestion.md §4.5) because AttractionClass codes are applied inconsistently.
insert into atlas.category_mappings (source, source_code, category_slug)
select s.id, 'kw:' || c.slug, c.slug
  from atlas.categories c
 cross join (values ('tw_tourism_attractions'), ('taipei_travel_attractions')) as s(id)
 where 'place' = any (c.applies_to) and c.slug <> 'other'
on conflict do nothing;

-- Tourism Data Standard V2 EventClassEnum (§附錄 16)
insert into atlas.category_mappings (source, source_code, category_slug)
select 'tw_tourism_events', code, slug
from (values
  ('1', 'festival'), ('101', 'festival'), ('102', 'festival'), ('103', 'festival'),
  ('104', 'festival'), ('105', 'festival'), ('106', 'festival'), ('107', 'festival'),
  ('108', 'festival'), ('109', 'sports'), ('110', 'festival'),
  ('2', 'culture'), ('201', 'performance'), ('202', 'performance'), ('203', 'performance'),
  ('204', 'kids'), ('205', 'performance'), ('206', 'exhibition'), ('207', 'workshop'),
  ('208', 'movie'), ('209', 'performance'), ('210', 'other'), ('211', 'other'),
  ('212', 'performance'), ('213', 'workshop'), ('214', 'workshop'), ('215', 'other'),
  ('3', 'festival'), ('4', 'other'), ('5', 'market'), ('9', 'other')
) as m(code, slug)
on conflict do nothing;

-- Ministry of Culture activity categories (cloud.culture.tw "category")
insert into atlas.category_mappings (source, source_code, category_slug)
select 'moc_kids_events', code, slug
from (values
  ('1', 'performance'), ('2', 'performance'), ('3', 'performance'), ('4', 'kids'),
  ('5', 'performance'), ('6', 'exhibition'), ('7', 'workshop'), ('8', 'movie'),
  ('11', 'performance'), ('13', 'other'), ('14', 'other'), ('15', 'other'),
  ('17', 'performance'), ('19', 'workshop'), ('200', 'workshop')
) as m(code, slug)
on conflict do nothing;

-- Original project categories (data/categories.txt) for the curated source.
insert into atlas.category_mappings (source, source_code, category_slug)
select 'curated', code, slug
from (values
  ('Active', 'sports'), ('Animals', 'animals'), ('Aquarium', 'animals'), ('Art', 'museum'),
  ('Beach', 'water'), ('Bike', 'trail'), ('Boardwalk', 'park'), ('Boat', 'water'),
  ('Children', 'playground'), ('Climbing', 'sports'), ('Craft', 'diy'), ('Culture', 'culture'),
  ('DIY', 'diy'), ('Eco Park', 'park'), ('Eco Park', 'nature'), ('Events', 'culture'),
  ('Experience', 'diy'), ('Factory Tour', 'diy'), ('Farm', 'farm'), ('Food', 'market'),
  ('Forest', 'nature'), ('Gondola', 'theme-park'), ('Ice Rink', 'sports'), ('Lake', 'nature'),
  ('Lake', 'water'), ('Learning', 'science'), ('Library', 'library'), ('Mall/Play', 'playground'),
  ('Market', 'market'), ('Mountain', 'nature'), ('Museum', 'museum'), ('Old Street', 'market'),
  ('Old Street', 'culture'), ('Park', 'park'), ('Performing Arts', 'culture'), ('Play', 'playground'),
  ('Play Café', 'playground'), ('Promenade', 'park'), ('Railway', 'transport'),
  ('Reservoir', 'nature'), ('Ride', 'theme-park'), ('Rides', 'theme-park'), ('Scenic', 'nature'),
  ('Science', 'science'), ('Snow', 'sports'), ('Swim', 'water'), ('Theme Park', 'theme-park'),
  ('Track', 'sports'), ('Trail', 'trail'), ('Viewpoint', 'nature'), ('Waterfall', 'nature'),
  ('Waterfront', 'water'), ('Waterplay', 'water'), ('Zoo', 'animals')
) as m(code, slug)
on conflict do nothing;

-- Taipei Travel category ids are only known once its API is reachable
-- (GET /{lang}/Miscellaneous/Categories?type=Attractions). Add mappings then.
