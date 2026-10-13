-- M0.3C.2A.1: isolated semantic extraction pilot state and evaluation reports.
-- Pilot writes never replace claim leads, editorial status or append-only observations.
CREATE TABLE IF NOT EXISTS semantic_claim_pilot_state(
  candidate_id text PRIMARY KEY REFERENCES discovery_candidates(id) ON DELETE CASCADE,
  content_fingerprint text NOT NULL,
  extraction jsonb NOT NULL,
  extraction_method text NOT NULL CHECK(extraction_method IN ('deterministic_v1','deepseek')),
  extraction_model text,
  extraction_version text NOT NULL,
  paid_call boolean NOT NULL DEFAULT false,
  last_processed_at timestamptz NOT NULL DEFAULT now(),
  grounding_diagnostics jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS semantic_claim_pilot_runs(
  id text PRIMARY KEY,
  mode text NOT NULL CHECK(mode IN ('preview','dry_run','apply')),
  sample_limit integer NOT NULL CHECK(sample_limit BETWEEN 1 AND 20),
  paid_enabled boolean NOT NULL DEFAULT false,
  max_calls integer NOT NULL CHECK(max_calls BETWEEN 0 AND 20),
  candidate_count integer NOT NULL DEFAULT 0 CHECK(candidate_count BETWEEN 0 AND 20),
  status text NOT NULL CHECK(status IN ('running','completed','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS semantic_claim_pilot_results(
  run_id text NOT NULL REFERENCES semantic_claim_pilot_runs(id) ON DELETE CASCADE,
  candidate_id text NOT NULL REFERENCES discovery_candidates(id) ON DELETE CASCADE,
  content_fingerprint text NOT NULL,
  before_classifications jsonb NOT NULL DEFAULT '[]',
  after_classification text NOT NULL CHECK(after_classification IN ('testable_claim','ordinary_news_event','generic_broadcast','entertainment','uncertain')),
  assertion_count integer NOT NULL CHECK(assertion_count BETWEEN 0 AND 8),
  extraction jsonb NOT NULL,
  grounding_diagnostics jsonb NOT NULL DEFAULT '{}',
  cache_hit boolean NOT NULL DEFAULT false,
  paid_call boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id,candidate_id)
);

CREATE INDEX IF NOT EXISTS semantic_claim_pilot_results_candidate_idx ON semantic_claim_pilot_results(candidate_id,created_at DESC);
