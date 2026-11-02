# Prototype normaliser: Tourism Administration AttractionList.json -> NormalizedPlace rows.
# Reference for the TypeScript implementation (docs/ingestion.md §4). Not production code.
# Usage: jq -c --slurpfile st AttractionServiceTimeList.json --slurpfile fees AttractionFeeList.json \
#           -f ta_attractions.jq AttractionList.json
def zh: if (. // "") == "" then {} else {"zh-Hant": .} end;
def daymap: {"Monday":"mon","Tuesday":"tue","Wednesday":"wed","Thursday":"thu","Friday":"fri",
             "Saturday":"sat","Sunday":"sun","PublicHolidays":"public_holidays",
             "DayBeforeHolidays":"day_before_holidays","DayAfterHolidays":"day_after_holidays",
             "TyphoonDay":"typhoon_day"};
def classweight: {"26":60,"20":60,"25":40,"27":40,"14":40,"9":40,"15":40,"19":30,"17":30,
                  "24":20,"16":20,"13":20,"12":20};
def statusmap: {"0":"permanently_closed","1":"open","2":"open","3":"temporarily_closed","9":"unknown"};
# Name keyword -> app category (emitted as "kw:<slug>" source codes; see docs/ingestion.md §4.5)
def kwrules: [
  ["animals",    "動物園|水族館|海洋館|昆蟲館|蝴蝶園|鳥園|牧場"],
  ["museum",     "博物館|美術館|文物館|紀念館|藝術館|展示館|文化館"],
  ["science",    "科學|科教館|天文|探索館|教育館|自然教育中心"],
  ["library",    "圖書館|書店"],
  ["theme-park", "樂園|遊樂園|主題園區"],
  ["playground", "遊戲場|兒童遊戲|共融|親子館|兒童館|遊樂場"],
  ["park",       "公園|綠地|森林園區"],
  ["trail",      "步道|自行車道|古道|綠廊|鐵馬道"],
  ["water",      "海灘|海水浴場|沙灘|親水|戲水"],
  ["farm",       "農場|牧場|農園|果園|茶園|休閒農業"],
  ["diy",        "觀光工廠|體驗館|工坊|DIY"],
  ["market",     "老街|夜市|市集|商圈"],
  ["hot-spring", "溫泉"],
  ["transport",  "車站|火車站|鐵道|機場"],
  ["nature",     "瀑布|海岸|濕地|峽谷|風景區"]
];

($st[0].AttractionServiceTimes | map({key: .AttractionID, value: .ServiceTimes}) | from_entries) as $stm
| ($fees[0].AttractionFees | map({key: .AttractionID, value: .Fees}) | from_entries) as $fm
| .Attractions[]
| . as $a
| ([.AttractionClasses[]? | tostring]) as $cls
| ((.AttractionName // "") as $nm | [ kwrules[] | . as $r | select($nm | test($r[1])) | "kw:" + $r[0] ]) as $kw
| ([.Facilities[]? | tostring]) as $fac
| ((.AttractionName // "") + " " + (.Description // "") + " " + ((.Tags // []) | join(" "))) as $txt
| ($fm[.AttractionID] // []) as $fee
| ([ $cls[] | classweight[.] // 0 ] | max // 0) as $base
| ( $base
    + (if (.AttractionName // "") | test("動物園|水族館|樂園|兒童|親子|博物館|科學館|科教館|天文館|圖書館|農場|牧場|觀光工廠") then 30 else 0 end)
    + (if $txt | test("親子|兒童|孩童|小朋友|幼兒|寶寶") then 30 else 0 end)
    + (if $txt | test("遊戲場|遊樂場|溜滑梯|共融|遊具|沙坑") then 30 else 0 end)
    + (if $txt | test("戲水|玩水|親水") then 15 else 0 end)
    + (if $txt | test("動物|水族|昆蟲|蝴蝶") then 10 else 0 end)
    + (if $txt | test("DIY|手作|體驗") then 10 else 0 end)
    + (if $txt | test("科學|科技|天文|恐龍|探索") then 10 else 0 end)
    + (if ($fac | index("3")) then 20 else 0 end)
    + (if ($fac | index("56")) then 15 else 0 end)
    - (if $txt | test("酒吧|夜店|酒莊|酒廠|賭場|情趣") then 60 else 0 end)
  ) as $raw_score
| (if .ServiceStatus == 0 then 0 else ([[ $raw_score, 0 ] | max, 100] | min) end) as $score
| ( [ (if $txt | test("親子|兒童|孩童|小朋友|幼兒|寶寶") then "family" else empty end),
      (if $txt | test("遊戲場|遊樂場|溜滑梯|共融|遊具|沙坑") then "playground" else empty end),
      (if ($txt | test("戲水|玩水|親水")) then "water_play" else empty end),
      (if ($cls | index("26")) or ($txt | test("動物|水族|昆蟲|蝴蝶")) then "animals" else empty end),
      (if ($cls | index("20")) then "rides" else empty end),
      (if ($cls | index("25")) or ($txt | test("科學|科技|天文|恐龍|探索")) then "learning" else empty end),
      (if $txt | test("DIY|手作|體驗") then "diy" else empty end),
      (if ($cls | any(. == "2" or . == "7" or . == "8" or . == "11" or . == "16" or . == "18")) then "nature" else empty end),
      (if ($fac | index("3")) then "nursing_room" else empty end),
      (if ($fac | index("56")) then "stroller_friendly" else empty end),
      (if ($a.IsAccessibleForFree == 1) or (($fee | length) > 0 and ($fee | all(.Price == 0))) then "free" else empty end)
    ] | unique ) as $kid_tags
| {
    source_id: .AttractionID,
    name: (.AttractionName | zh),
    alt_names: (.AlternateNames // []),
    description: (.Description | zh),
    address: (((.PostalAddress.City // "") + (.PostalAddress.Town // "") + (.PostalAddress.StreetAddress // "")) | zh),
    postal_code: .PostalAddress.ZipCode,
    city_code: .PostalAddress.CityCode,
    city_name: .PostalAddress.City,
    district_code: .PostalAddress.TownCode,
    district_name: .PostalAddress.Town,
    lat: .PositionLat,
    lng: .PositionLon,
    phone: (.Telephones[0].Tel // null),
    website_url: (if (.WebsiteURL // "") == "" then null else .WebsiteURL end),
    booking_url: (.ReservationURLs[0] // null),
    source_url: null,
    source_categories: ($cls + $kw),
    tags: (.Tags // []),
    kid_tags: $kid_tags,
    kid_score: $score,
    is_free: (if .IsAccessibleForFree == 1 then true
              elif ($fee | length) > 0 then ($fee | all(.Price == 0))
              else null end),
    price_level: (if ($fee | length) == 0 then null
                  else ([$fee[].Price // 0] | max) as $p
                       | if $p == 0 then 0 elif $p <= 200 then 1 elif $p <= 600 then 2 else 3 end end),
    fee_text: (if ($fee | length) > 0
               then ([$fee[] | "\(.Name)：NT$\(.Price)"] | join("；") | zh)
               else (.FeeInfo | zh) end),
    opening_hours: (($stm[.AttractionID] // null)
                    | if . == null then null else
                      { periods: [ .[] | { days: [ .ServiceDays[]? | daymap[.] // . ],
                                           opens: (.StartTime // "" | .[0:5]),
                                           closes: (.EndTime // "" | .[0:5]),
                                           label: (.Name | zh),
                                           valid_from: .EffectiveDate,
                                           valid_to: .ExpireDate } ] }
                      end),
    opening_hours_text: (.ServiceTimeInfo | zh),
    facilities: $fac,
    images: [ .Images[]? | select((.URL // "") | startswith("https://"))
              | { url: .URL, caption: (.Name | zh), credit: .Description } ],
    service_status: (statusmap[(.ServiceStatus // 9) | tostring] // "unknown"),
    source_updated_at: .UpdateTime,
    raw: $a
  }
