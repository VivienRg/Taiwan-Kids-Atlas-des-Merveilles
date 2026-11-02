# Reference normalisers (jq)

**These are reference implementations, not production code.** They turn raw feed files into the
`NormalizedPlace` / `NormalizedEvent` rows described in [../../ingestion.md §4](../../ingestion.md#4-normalised-row-contract).
They were used on 2026-11-02 to load the full live feeds into a database built from the migrations and
to verify the SQL upsert, removal, dedupe and link logic.
The TypeScript adapters must reproduce their output: same rules, same field shapes.

| File | Input | Notes |
|---|---|---|
| `ta_attractions.jq` | `AttractionList.json` (+ `--slurpfile st AttractionServiceTimeList.json --slurpfile fees AttractionFeeList.json`) | kid score rules v1, name-keyword categories |
| `ta_events.jq` | `EventList.json` | one occurrence per event |
| `moc_events.jq` | Ministry of Culture category-4 JSON array | Taipei-time → ISO, address parsing |
| `curated.jq` | `data/activities.json` (+ `--slurpfile links curated_links.json`) | name split en / zh-Hant, tag mapping |
| `curated_links.sample.json` | – | 5 verified curated → TA links to start `data/curated_links.json` |

Example:

```bash
unzip Attraction-json.zip -d mta
jq -c --slurpfile st mta/AttractionServiceTimeList.json --slurpfile fees mta/AttractionFeeList.json \
   -f ta_attractions.jq mta/AttractionList.json > ta_rows.ndjson      # 6,205 rows
jq -c -f moc_events.jq moc4.json > moc_events.ndjson                   # 58 rows
```

Each output line is one row. Batch rows into JSON arrays of ≤500 and call
`select atlas.upsert_places(<run_id>, '<array>'::jsonb)` or `atlas.upsert_events(...)` between
`atlas.start_run(...)` and `atlas.finish_run(...)`.
