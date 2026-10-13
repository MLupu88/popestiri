-- M0.3C.2A: claim-first discovery. These tables are deliberately separate
-- from discovery_candidates and the verified claims/evidence workflow.
CREATE TABLE IF NOT EXISTS claim_leads(
  id text PRIMARY KEY,
  assertion_text text,
  exact_text text,
  machine_paraphrase text,
  classification text NOT NULL CHECK(classification IN ('testable_claim','ordinary_news_event','generic_broadcast','entertainment','uncertain')),
  extraction_method text NOT NULL CHECK(extraction_method IN ('deterministic_v1','deepseek','manual')),
  extraction_model text,
  extraction_version text NOT NULL,
  extraction_limitations text NOT NULL,
  extraction_evidence jsonb NOT NULL DEFAULT '[]',
  grouping_key text NOT NULL UNIQUE,
  platform text NOT NULL,
  discovery_method text NOT NULL,
  publisher_name text,
  publisher_id text,
  channel_title text,
  channel_id text,
  surfaced_reason text NOT NULL,
  editorial_status text NOT NULL DEFAULT 'new' CHECK(editorial_status IN ('new','reviewing','investigating','closed','dismissed')),
  editorial_interest numeric CHECK(editorial_interest BETWEEN 0 AND 100),
  verification_priority numeric CHECK(verification_priority BETWEEN 0 AND 100),
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claim_lead_references(
  id text PRIMARY KEY,
  claim_lead_id text NOT NULL REFERENCES claim_leads(id) ON DELETE CASCADE,
  candidate_id text NOT NULL REFERENCES discovery_candidates(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  original_url text NOT NULL,
  platform text NOT NULL,
  discovery_method text NOT NULL,
  publisher_name text,
  publisher_id text,
  channel_title text,
  channel_id text,
  published_at timestamptz,
  observed_at timestamptz NOT NULL,
  extraction_evidence jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(claim_lead_id,candidate_id,source_id)
);

CREATE TABLE IF NOT EXISTS claim_observations(
  id text PRIMARY KEY,
  claim_lead_id text NOT NULL REFERENCES claim_leads(id) ON DELETE CASCADE,
  candidate_id text NOT NULL REFERENCES discovery_candidates(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  metric_source text NOT NULL,
  availability_status text NOT NULL CHECK(availability_status IN ('observed','not_available','not_applicable')),
  view_count bigint CHECK(view_count >= 0),
  comment_count bigint CHECK(comment_count >= 0),
  metrics jsonb NOT NULL DEFAULT '{}',
  limitation text NOT NULL,
  captured_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(claim_lead_id,candidate_id,observed_at,metric_source)
);

CREATE INDEX IF NOT EXISTS claim_leads_status_idx ON claim_leads(editorial_status,last_observed_at DESC);
CREATE INDEX IF NOT EXISTS claim_leads_classification_idx ON claim_leads(classification,last_observed_at DESC);
CREATE INDEX IF NOT EXISTS claim_lead_references_lead_idx ON claim_lead_references(claim_lead_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS claim_observations_lead_idx ON claim_observations(claim_lead_id,observed_at ASC);

-- Keep a partially applied local database compatible with the same migration.
ALTER TABLE claim_leads ADD COLUMN IF NOT EXISTS editorial_interest numeric CHECK(editorial_interest BETWEEN 0 AND 100);
ALTER TABLE claim_leads ADD COLUMN IF NOT EXISTS verification_priority numeric CHECK(verification_priority BETWEEN 0 AND 100);
