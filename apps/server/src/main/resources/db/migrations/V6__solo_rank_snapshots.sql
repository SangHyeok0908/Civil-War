CREATE TABLE solo_rank_snapshots (
 player_id varchar(36) PRIMARY KEY REFERENCES player_accounts(id),
 status varchar(24) NOT NULL,
 tier varchar(24), division varchar(4),
 seed_value double precision NOT NULL CHECK(seed_value BETWEEN 0 AND 100),
 observed_at timestamptz, attempted_at timestamptz,
 next_attempt_at timestamptz
);
UPDATE player_accounts a SET official_puuid=r.official_puuid
 FROM members m JOIN member_reference_links r ON r.member_id=m.id
 WHERE a.id=m.account_id AND a.official_puuid IS NULL;
