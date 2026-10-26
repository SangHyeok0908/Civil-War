CREATE TABLE member_reference_links (
 member_id varchar(36) PRIMARY KEY REFERENCES members(id), official_puuid varchar(255) NOT NULL UNIQUE, confirmed_at timestamptz NOT NULL
);
CREATE TABLE role_reference_samples (
 id varchar(36) PRIMARY KEY, member_id varchar(36) NOT NULL REFERENCES members(id),
 source varchar(20) NOT NULL CHECK(source='solo420'), game_id varchar(100) NOT NULL,
 played_at timestamptz NOT NULL, role varchar(16) NOT NULL, evidence_json text NOT NULL,
 UNIQUE(member_id,source,game_id)
);
