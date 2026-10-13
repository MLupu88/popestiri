-- M0.3C.2A.1 hardening: persist pilot accounting and provider usage without
-- changing core claim, editorial or append-only observation tables.
ALTER TABLE semantic_claim_pilot_state
  ADD COLUMN IF NOT EXISTS usage jsonb NOT NULL DEFAULT '{}';

ALTER TABLE semantic_claim_pilot_runs
  ADD COLUMN IF NOT EXISTS api_attempts integer NOT NULL DEFAULT 0 CHECK(api_attempts BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS accepted_extractions integer NOT NULL DEFAULT 0 CHECK(accepted_extractions BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS rejected_responses integer NOT NULL DEFAULT 0 CHECK(rejected_responses BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS cache_hits integer NOT NULL DEFAULT 0 CHECK(cache_hits BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS deterministic_fallbacks integer NOT NULL DEFAULT 0 CHECK(deterministic_fallbacks BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS usage jsonb NOT NULL DEFAULT '{}';

ALTER TABLE semantic_claim_pilot_results
  ADD COLUMN IF NOT EXISTS api_attempted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_extraction boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejected_response boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deterministic_fallback boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS usage jsonb NOT NULL DEFAULT '{}';
