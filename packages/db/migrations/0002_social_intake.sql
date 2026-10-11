CREATE TABLE social_intake_items(
  id text PRIMARY KEY,
  original_url text NOT NULL,
  canonical_url text NOT NULL UNIQUE,
  platform text NOT NULL CHECK(platform IN ('facebook','tiktok','youtube')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submission_source text NOT NULL CHECK(char_length(submission_source) BETWEEN 1 AND 200),
  claim_description text NOT NULL CHECK(char_length(claim_description) BETWEEN 1 AND 1000),
  investigation_reason text NOT NULL CHECK(char_length(investigation_reason) BETWEEN 1 AND 1000),
  editorial_status text NOT NULL DEFAULT 'new' CHECK(editorial_status IN ('new','reviewing','investigating','closed')),
  metadata jsonb NOT NULL DEFAULT '{}',
  metadata_status text NOT NULL DEFAULT 'not_retrieved' CHECK(metadata_status IN ('not_retrieved','manually_confirmed')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE social_intake_provenance(
  id text PRIMARY KEY,
  intake_id text NOT NULL REFERENCES social_intake_items(id) ON DELETE CASCADE,
  original_url text NOT NULL,
  submission_source text NOT NULL CHECK(char_length(submission_source) BETWEEN 1 AND 200),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  claim_description text NOT NULL CHECK(char_length(claim_description) BETWEEN 1 AND 1000),
  investigation_reason text NOT NULL CHECK(char_length(investigation_reason) BETWEEN 1 AND 1000),
  actor text NOT NULL DEFAULT 'operator',
  UNIQUE(intake_id, id)
);
CREATE INDEX social_intake_filter_idx ON social_intake_items(platform, editorial_status, submitted_at DESC);
CREATE INDEX social_intake_provenance_item_idx ON social_intake_provenance(intake_id, submitted_at DESC);
