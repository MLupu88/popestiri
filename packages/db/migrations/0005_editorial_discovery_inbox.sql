-- M0.3C.1.1: remove persisted self-groups without touching candidates or evidence.
-- The cleanup is intentionally repeatable: only grouping metadata is changed.
ALTER TABLE discovery_groups ADD COLUMN IF NOT EXISTS provisional boolean NOT NULL DEFAULT true;

ALTER TABLE discovery_groups DROP CONSTRAINT IF EXISTS discovery_groups_method_check;
ALTER TABLE discovery_groups ADD CONSTRAINT discovery_groups_method_check
  CHECK(method IN ('conservative_title_overlap','lexical_multi_source_v1'));

WITH invalid_groups AS (
  SELECT g.id
  FROM discovery_groups g
  LEFT JOIN discovery_group_members gm ON gm.group_id = g.id
  LEFT JOIN discovery_candidates c ON c.id = gm.candidate_id
  GROUP BY g.id
  HAVING count(DISTINCT c.id) < 2 OR count(DISTINCT c.source_id) < 2
)
DELETE FROM discovery_group_members gm
USING invalid_groups bad
WHERE gm.group_id = bad.id;

DELETE FROM discovery_groups g
WHERE NOT EXISTS (
  SELECT 1 FROM discovery_group_members gm WHERE gm.group_id = g.id
);
