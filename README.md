# 🗺️ Activity Map

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub issues](https://img.shields.io/github/issues/VivienRg/Activity-Map)](https://github.com/VivienRg/Activity-Map/issues)
[![GitHub stars](https://img.shields.io/github/stars/VivienRg/Activity-Map)](https://github.com/VivienRg/Activity-Map/stargazers)
[![GitHub last commit](https://img.shields.io/github/last-commit/VivienRg/Activity-Map)](https://github.com/VivienRg/Activity-Map/commits/main)

<div align="center">
  <img src="assets/logo.png" alt="Activity Map Logo" width="200">
  <p>Discover and share family-friendly activities in your area</p>
</div>

## 🌟 Description

Activity Map is a community-driven platform for discovering and sharing family-friendly activities and destinations. The platform allows users to browse activities by category, region, and age group, making it easy to find the perfect outing for families with children.

> **⚠️ Note:** This currently only lists activities within a 1-hour range around Zhongli. We welcome contributions to expand both the activities and the coverage area!

## ✨ Features

- 🗺️ Interactive map view of activities
- 🔍 Advanced search and filtering
- 📱 Mobile-friendly design
- 🌍 Community-contributed content
- 📊 Activity details including pricing, age range, and more

## 🚀 Getting Started

1. **Browse** activities on the map or list view
2. **Filter** by category, region, or age group
3. **Click** on any activity for more details
4. **Submit** new activities using our GitHub Issue form

## 🤝 How to Contribute

We welcome contributions from the community! Here's how you can help:

### Adding a New Activity
1. Click on [New Activity Submission](https://github.com/VivienRg/Activity-Map/issues/new?template=add_activity.yml)
2. Fill in all the required fields in the Issue Form
3. Submit the issue - our automated system will process your submission

### Development
1. Fork the repository
2. Create a new branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Commit your changes: `git commit -m 'Add some feature'`
5. Push to the branch: `git push origin feature/your-feature`
6. Open a Pull Request

## 📂 Project Structure

```
.
├── .github/               # GitHub workflows and issue templates
│   ├── ISSUE_TEMPLATE/
│   └── workflows/
├── assets/               # Static assets (images, styles, scripts)
├── data/                 # Activity data and schemas
└── index.html            # Main application page
```

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🖥️ Backend & data ingestion (Taiwan Kids Atlas)

The Postgres/Supabase backend and the Taiwan open-data ingestion worker live under `supabase/`:

- `supabase/migrations/` — atlas schema, idempotent ingestion SQL, public PostgREST API, RLS, opt-in pg_cron scheduling (7 migrations, apply in order).
- `supabase/seed.sql` — development seed data (87 curated places).
- `supabase/functions/_shared/ingest/` — Deno worker: fetchers for TA attractions/events (Taiwan Tourism Administration zip feeds), MOC 親子 events, and curated file-based sources; normalization, idempotent upserts keyed on (source, source_id), removal detection with guard limits.
- `supabase/functions/_shared/ingest/__tests__/run_all.ts` — unit tests for normalizers/rules plus an integration test against local Postgres (`deno task test`).

### Running locally

1. Copy `supabase/functions/.env.example` to `supabase/functions/.env` and fill in values (real credentials are never committed; only `.env.example` is tracked).
2. Start local PostGIS: `docker compose up -d` (listens on localhost:54330).
3. Apply migrations in order, then load seed data:
   `psql -h localhost -p 54330 -U postgres -d atlas_dev -v ON_ERROR_STOP=1 -f supabase/migrations/20261102000100_*.sql` (01–07), then `-f supabase/seed.sql`.
4. Run ingestion: `cd supabase/functions && DATABASE_URL=postgresql://postgres:postgres@localhost:54330/atlas_dev deno task ingest --source tw_tourism_attractions` (use `--all` for every enabled source; `--dry-run` to preview without writes).
5. Run the test suite: `deno task test`.

## 👤 Author

**Vivien Roggero**  
🌐 [The One Person Company](https://theoneperson.company)  
🌐 [GitHub Profile](https://github.com/VivienRg)  
🌐 [Website](https://vivienroggero.com)  
📧 [Email Me](mailto:vivien@roggero.io)

---

<div align="center">
  Made with ❤️ for families everywhere
</div>
