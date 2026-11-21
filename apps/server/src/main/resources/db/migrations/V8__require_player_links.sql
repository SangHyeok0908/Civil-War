-- Additive migrations already backfilled legacy keys. Fail rather than discard an unmatched row.
ALTER TABLE members ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE match_participants ALTER COLUMN player_id SET NOT NULL;
