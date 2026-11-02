# Prototype normaliser: Ministry of Culture activity feed (category=4, 親子) -> NormalizedEvent rows.
# Reference for the TypeScript implementation (docs/ingestion.md §4). Not production code.
def zh: if (. // "") == "" then {} else {"zh-Hant": .} end;
def tw_time: if (. // "") == "" then null
             else (gsub("/"; "-") | sub(" "; "T")) + "+08:00" end;
def area: (. // "") | gsub("台"; "臺")
          | (capture("(?<city>[^\\s（(]{2}[市縣])(?<town>[^\\s（(市縣]{1,3}?[區鄉鎮市])?") // {city: null, town: null});

.[]
| . as $e
| ([.showInfo[]?.price // "" ] | join(" ")) as $prices
| {
    source_id: .UID,
    name: (.title | zh),
    description: (.descriptionFilterHtml | zh),
    source_categories: [ .category, "4" ] | unique,
    tags: [],
    kid_tags: ["family"],
    kid_score: 80,
    status: "scheduled",
    is_free: (if ($prices + " " + (.discountInfo // "")) | test("免費") then true else null end),
    price_text: (.discountInfo | zh),
    organizer: ([.masterUnit[]?] | join("、") | zh),
    website_url: (if (.sourceWebPromote // "") == "" then null else .sourceWebPromote end),
    ticket_url: (if (.webSales // "") == "" then null else .webSales end),
    source_url: null,
    images: (if (.imageUrl // "") | startswith("https://") then [{url: .imageUrl, caption: {}, credit: (.sourceWebName // null)}] else [] end),
    source_updated_at: (.editModifyDate | tw_time),
    occurrences: [ .showInfo[]? | (.location | area) as $ar | {
        starts_at: (.time | tw_time),
        ends_at: (.endTime | tw_time),
        venue_name: (.locationName | zh),
        address: (.location | zh),
        city_name: $ar.city,
        district_name: $ar.town,
        lat: .latitude,
        lng: .longitude,
        price_text: (.price | zh),
        ticket_url: null
      } | select(.starts_at != null) ],
    raw: $e
  }
| select((.occurrences | length) > 0)
