-- Solo ranks are looked up when a team recommendation is requested, so no retry schedule is kept.
ALTER TABLE solo_rank_snapshots DROP COLUMN next_attempt_at;
