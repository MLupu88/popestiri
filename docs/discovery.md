# M0.3C.1 — Automated Discovery

Automated discovery runs in the existing one-shot worker after the RSS batch. It has a separate PostgreSQL advisory lock and failure boundary, so an unavailable discovery provider does not cancel RSS ingestion or manual Social Intake.

The `discovery_source_registry` table is the allowlisted, configurable registry. Each entry has a kind, endpoint, verification URL, viewpoint, region, enable flag and verification timestamp. The initial registry contains three Romanian RSS feeds (HotNews, Digi24 and G4Media), the public Google Trends Romania export, and the official YouTube Data API endpoint. No feed URL is inferred from a homepage or added by scraping.

Google Trends uses the public `Trending now` RSS export for `geo=RO`. The adapter validates HTTPS, host, path and region before downloading. Its rank/traffic fields are stored as observable search-interest signals only; they are not evidence that a topic is true, important or representative.

YouTube uses the official Data API only. It labels date-ordered `search.list` results as `recent_search`, and separately calls `videos.list` with `chart=mostPopular&regionCode=RO`, labeling those results `most_popular_chart`. The two signals are not collapsed into a claim that a video is generally popular. At most two search queries are used per run; with the hourly timer this stays below the documented 100-call daily `search.list` default, while `videos.list` uses the separate low-cost quota bucket. If `YOUTUBE_API_KEY` is absent, the run records `missing_youtube_api_key` and does not request YouTube pages or scrape them. Query terms default to `știri România,actualitate România` and may be changed with `YOUTUBE_DISCOVERY_QUERIES` (comma-separated; only the first two are used).

`discovery_candidates` is the unified inbox. It retains original and canonical URLs, source registry ID, timestamps, title/summary, provenance, and raw observable popularity signals. `editorial_interest` and `verification_priority` are independent nullable editorial fields; no score is calculated from popularity. Candidate status is workflow state only and is not a truth verdict.

Exact canonical URLs are deduplicated across adapters. A conservative title-token grouping runs over the last seven days and only groups headlines observed on the same day with the same set of at least three meaningful tokens. Groups are explicitly marked heuristic and do not assert that the underlying reports are true or the same event.

Manual Social Intake remains a supplementary input. It is present in the unified inbox but is excluded from automated adapter execution, so it cannot create a false unavailable/partial discovery run. When migration `0003` is present, each submission also appears in the unified inbox with its manual provenance and with no invented engagement fields.

Apply all migrations with `pnpm db:migrate`. The existing `popestiri-rss-ingest.timer` remains hourly; it now emits separate `rss_batch_import` and `discovery_batch` JSON log events. Inspect `discovery_runs` and `audit_events` for adapter status, counts, limitations and error codes. A partial run is expected when optional YouTube credentials are not configured. To validate the actual enabled RSS and Google Trends endpoints without writing candidates, run `pnpm discovery:validate`; inaccessible or incompatible endpoints produce a structured report and a non-zero exit.

The admin page `/admin/discoveries` separates source, observed signals, editorial interest and verification priority. It shows the original link and provider limitation. No AI verdict, publication or automated truth claim is implemented in this milestone.
