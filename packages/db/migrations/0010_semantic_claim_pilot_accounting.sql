-- Post-merge semantic pilot accounting additions.
-- Keep the already-applied 0009 migration unchanged.
ALTER TABLE semantic_claim_pilot_runs
  ADD COLUMN IF NOT EXISTS fresh_deepseek_successes integer NOT NULL DEFAULT 0 CHECK(fresh_deepseek_successes BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS deterministic_extractions integer NOT NULL DEFAULT 0 CHECK(deterministic_extractions BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS cached_extractions integer NOT NULL DEFAULT 0 CHECK(cached_extractions BETWEEN 0 AND 20);

ALTER TABLE semantic_claim_pilot_results
  ADD COLUMN IF NOT EXISTS extraction_origin text CHECK(extraction_origin IN ('cache_hit','fresh_deepseek','deterministic','deterministic_fallback'));
