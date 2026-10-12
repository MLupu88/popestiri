-- M0.3C.2A review fixes: durable candidate processing state.
-- This migration does not rewrite candidates, leads, references or observations.
CREATE TABLE IF NOT EXISTS claim_radar_candidate_state(
  candidate_id text PRIMARY KEY REFERENCES discovery_candidates(id) ON DELETE CASCADE,
  claim_lead_id text REFERENCES claim_leads(id) ON DELETE SET NULL,
  content_fingerprint text NOT NULL,
  metric_fingerprint text NOT NULL,
  extraction jsonb NOT NULL,
  last_candidate_updated_at timestamptz NOT NULL,
  last_processed_at timestamptz NOT NULL DEFAULT now(),
  processing_status text NOT NULL CHECK(processing_status IN ('processed','failed')),
  last_error text
);

CREATE TABLE IF NOT EXISTS claim_radar_checkpoint(
  id text PRIMARY KEY,
  historical_backfill_complete boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO claim_radar_checkpoint(id) VALUES('default') ON CONFLICT(id) DO NOTHING;
CREATE INDEX IF NOT EXISTS claim_radar_state_updated_idx ON claim_radar_candidate_state(last_candidate_updated_at,candidate_id);
