CREATE TABLE discovery_source_registry(
  id text PRIMARY KEY,
  kind text NOT NULL CHECK(kind IN ('rss','google_trends','youtube_api','social_intake')),
  name text NOT NULL,
  endpoint_url text NOT NULL,
  verification_url text NOT NULL,
  viewpoint text NOT NULL,
  region text NOT NULL DEFAULT 'RO',
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}',
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE discovery_runs(
  id text PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK(status IN ('running','succeeded','partial','failed','skipped')),
  adapter_results jsonb NOT NULL DEFAULT '{}',
  candidates_seen integer NOT NULL DEFAULT 0 CHECK(candidates_seen >= 0),
  candidates_added integer NOT NULL DEFAULT 0 CHECK(candidates_added >= 0),
  groups_updated integer NOT NULL DEFAULT 0 CHECK(groups_updated >= 0),
  error_code text
);

CREATE TABLE discovery_candidates(
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES discovery_source_registry(id),
  source_kind text NOT NULL CHECK(source_kind IN ('rss','google_trends','youtube_api','social_intake')),
  source_name text NOT NULL,
  original_url text NOT NULL,
  canonical_url text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  observed_at timestamptz NOT NULL,
  published_at timestamptz,
  provenance jsonb NOT NULL DEFAULT '{}',
  popularity_signals jsonb NOT NULL DEFAULT '{}',
  editorial_interest numeric CHECK(editorial_interest BETWEEN 0 AND 100),
  verification_priority numeric CHECK(verification_priority BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','queued','reviewing','dismissed','grouped')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE discovery_groups(
  id text PRIMARY KEY,
  grouping_key text NOT NULL UNIQUE,
  title text NOT NULL,
  method text NOT NULL CHECK(method IN ('conservative_title_overlap')),
  first_seen timestamptz NOT NULL,
  last_seen timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE discovery_group_members(
  group_id text NOT NULL REFERENCES discovery_groups(id) ON DELETE CASCADE,
  candidate_id text NOT NULL REFERENCES discovery_candidates(id) ON DELETE CASCADE,
  matched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(group_id,candidate_id)
);

CREATE INDEX discovery_candidates_status_idx ON discovery_candidates(status,observed_at DESC);
CREATE INDEX discovery_candidates_source_idx ON discovery_candidates(source_kind,observed_at DESC);
CREATE INDEX discovery_candidates_title_idx ON discovery_candidates(title);
CREATE INDEX discovery_runs_started_idx ON discovery_runs(started_at DESC);

INSERT INTO discovery_source_registry(id,kind,name,endpoint_url,verification_url,viewpoint,region,config,verified_at)
VALUES
 ('rss-hotnews','rss','HotNews','https://rss.hotnews.ro','https://hotnews.ro/ce-este-rss-1654765','general independent newsroom','RO','{"language":"ro","registry":"built_in_verified"}',now()),
 ('rss-digi24','rss','Digi24','https://www.digi24.ro/rss','https://www.digi24.ro/','general television newsroom','RO','{"language":"ro","registry":"built_in_verified"}',now()),
 ('rss-g4media','rss','G4Media','https://www.g4media.ro/feed/','https://www.g4media.ro/','independent digital newsroom','RO','{"language":"ro","registry":"built_in_verified"}',now()),
 ('google-trends-ro','google_trends','Google Trends — România','https://trends.google.com/trending/rss?geo=RO','https://support.google.com/trends/answer/3076011','search-interest signal, not a news source','RO','{"feed":"Trending now RSS export","timeWindow":"24h"}',now()),
 ('youtube-api-ro','youtube_api','YouTube Data API — România','https://www.googleapis.com/youtube/v3/search','https://developers.google.com/youtube/v3/docs/search/list','video discovery signal, not a truth signal','RO','{"api":"YouTube Data API v3","regionCode":"RO","relevanceLanguage":"ro"}',now()),
 ('social-intake','social_intake','Social Intake manual','https://www.youtube.com/','../docs/social-intake.md','operator-submitted supplementary signal','RO','{"automated":false}',now())
ON CONFLICT(id) DO NOTHING;
