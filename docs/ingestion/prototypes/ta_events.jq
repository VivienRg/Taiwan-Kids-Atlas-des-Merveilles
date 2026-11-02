# Prototype normaliser: Tourism Administration EventList.json -> NormalizedEvent rows.
def zh: if (. // "") == "" then {} else {"zh-Hant": .} end;
.Events[]
| . as $e
| ([.EventClasses[]? | tostring]) as $cls
| ((.EventName // "") + " " + (.Description // "")) as $txt
| ( (if ($cls | index("204")) then 70 else 0 end)
    + (if $txt | test("親子|兒童|孩童|小朋友|幼兒|寶寶") then 50 else 0 end)
    + (if $txt | test("DIY|手作|體驗|闖關|童玩") then 10 else 0 end)
  ) as $s
| {
    source_id: .EventID,
    name: (.EventName | zh),
    description: (.Description | zh),
    source_categories: $cls,
    tags: (.Tags // []),
    kid_tags: [ (if ($cls | index("204")) or ($txt | test("親子|兒童|孩童|小朋友|幼兒|寶寶")) then "family" else empty end),
                (if .IsAccessibleForFree == 1 then "free" else empty end) ],
    kid_score: ([$s, 100] | min),
    status: ({"EventScheduled":"scheduled","EventCancelled":"cancelled","EventPostponed":"postponed","EventRescheduled":"rescheduled"}[.EventStatus] // "scheduled"),
    is_free: (if .IsAccessibleForFree == 1 then true elif .IsAccessibleForFree == 0 then false else null end),
    price_text: (.FeeInfo | zh),
    organizer: ([.Organizations[]?.Name // empty] | join("、") | zh),
    website_url: (if (.WebsiteURL // "") == "" then null else .WebsiteURL end),
    ticket_url: (.ReservationURLs[0] // null),
    source_url: null,
    images: [ .Images[]? | select((.URL // "") | startswith("https://")) | {url: .URL, caption: (.Name | zh), credit: .Description} ],
    source_updated_at: .UpdateTime,
    occurrences: [ {
        starts_at: .StartDateTime,
        ends_at: .EndDateTime,
        venue_name: {},
        address: (((.PostalAddress.City // "") + (.PostalAddress.Town // "") + (.PostalAddress.StreetAddress // "")) | zh),
        city_code: .PostalAddress.CityCode,
        city_name: .PostalAddress.City,
        district_code: .PostalAddress.TownCode,
        district_name: .PostalAddress.Town,
        lat: .PositionLat,
        lng: .PositionLon,
        price_text: {},
        ticket_url: null
      } | select(.starts_at != null) ],
    raw: $e
  }
| select((.occurrences | length) > 0)
