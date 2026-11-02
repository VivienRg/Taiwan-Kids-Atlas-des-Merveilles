# Prototype normaliser: original project data/activities.json -> NormalizedPlace rows (source "curated").
# --slurpfile links curated_links.json  ({"<curated id>": "<TA AttractionID>"})
def kidtag: {"AC":"air_con","ac":"air_con","active":"active","dog friendly":"dog_friendly","food":"food",
             "snacks":"food","learning":"learning","nature":"nature","stroller":"stroller_friendly",
             "waterplay":"water_play","splash":"water_play","pool":"water_play","rides":"rides",
             "seasonal":"seasonal","creative":"diy","DIY":"diy","ceramics":"diy","free":"free",
             "shade":"shade","indoor":"indoor"};
($links[0] // {}) as $lk
| .[]
| . as $a
| (.name as $nm | ($nm | capture("^(?<en>.*?)\\s*\\((?<zh>[^)]*\\p{Han}[^)]*)\\)\\s*$")) // {en: $nm, zh: null}) as $n
| {
    source_id: .id,
    name: ({en: $n.en} + (if $n.zh then {"zh-Hant": $n.zh} else {} end)),
    alt_names: [],
    description: {en: .desc},
    address: (if (.address_en // "") == "" then {} else {en: .address_en} end),
    city_name: .city,
    district_name: .district,
    lat: null, lng: null,
    website_url: (if (.website // "") == "" then null else .website end),
    source_categories: .categories,
    tags: .tags,
    kid_tags: ((["family"] + [ .tags[]? | kidtag[.] // empty ]
                + (if (.categories // []) | index("Seasonal") then ["seasonal"] else [] end)   # category, not a place type
                + (if .indoor_outdoor == "Indoor" then ["indoor"] elif .indoor_outdoor == "Outdoor" then ["outdoor"] else [] end)
                + (if .cost_range == "0" then ["free"] else [] end)) | unique),
    kid_score: 100,
    age_min: (.age_range[0] // null),
    age_max: (.age_range[1] // null),
    indoor_outdoor: ((.indoor_outdoor // "") | ascii_downcase | if . == "" then null else . end),
    is_free: (if .cost_range == "0" then true elif (.cost_range // "") == "" then null else false end),
    price_level: ({"0":0,"1–200":1,"200–600":2,"600+":3}[.cost_range] // null),
    fee_text: (if (.cost_range // "") == "" then {} elif .cost_range == "0" then {en: "Free", "zh-Hant": "免費"} else {en: "NT$\(.cost_range)"} end),
    images: [],
    service_status: "open",
    linked: (if $lk[.id] then {source: "tw_tourism_attractions", source_id: $lk[.id]} else null end),
    raw: $a
  }
