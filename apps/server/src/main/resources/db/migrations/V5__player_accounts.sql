CREATE TABLE player_accounts (
 id varchar(36) PRIMARY KEY,
 lcu_puuid varchar(255) UNIQUE,
 official_puuid varchar(255) UNIQUE,
 riot_id varchar(255),
 link_status varchar(24) NOT NULL,
 updated_at timestamptz NOT NULL
);
INSERT INTO player_accounts(id,lcu_puuid,riot_id,link_status,updated_at)
 SELECT id,puuid,riot_id,'lcu_linked',CURRENT_TIMESTAMP FROM members;
ALTER TABLE members ADD COLUMN account_id varchar(36) UNIQUE REFERENCES player_accounts(id);
UPDATE members SET account_id=id;
ALTER TABLE members ALTER COLUMN puuid DROP NOT NULL;
ALTER TABLE match_participants ADD COLUMN player_id varchar(36) REFERENCES player_accounts(id);
UPDATE match_participants p SET player_id=m.account_id FROM members m WHERE p.member_id=m.id;
ALTER TABLE match_participants ALTER COLUMN member_id DROP NOT NULL;
CREATE UNIQUE INDEX match_player_unique ON match_participants(match_id,player_id);
CREATE TABLE account_identity_evidence (
 id varchar(36) PRIMARY KEY,
 player_id varchar(36) NOT NULL REFERENCES player_accounts(id),
 source varchar(32) NOT NULL,
 riot_id varchar(255) NOT NULL,
 observed_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL
);
UPDATE service_state SET source_revision=source_revision+1, active_generation_id=NULL WHERE id=1;
INSERT INTO recalculation_jobs(id,source_revision,status,created_at)
 SELECT gen_random_uuid()::text,source_revision,'pending',CURRENT_TIMESTAMP FROM service_state
 ON CONFLICT(source_revision) DO NOTHING;
