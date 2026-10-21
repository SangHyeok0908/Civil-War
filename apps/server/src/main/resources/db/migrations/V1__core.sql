CREATE TABLE members (
 id varchar(36) PRIMARY KEY, puuid varchar(255) NOT NULL UNIQUE,
 riot_id varchar(255) NOT NULL, display_name varchar(100) NOT NULL,
 active boolean NOT NULL, primary_role varchar(16), secondary_role varchar(16),
 allowed_roles varchar(100) NOT NULL, seed_skill integer NOT NULL CHECK(seed_skill BETWEEN 0 AND 100),
 profile_revision bigint NOT NULL
);
CREATE TABLE service_state (
 id integer PRIMARY KEY CHECK(id=1), source_revision bigint NOT NULL,
 desired_scoring_version varchar(100), active_generation_id varchar(36)
);
INSERT INTO service_state(id,source_revision) VALUES(1,0);
CREATE TABLE recalculation_jobs (
 id varchar(36) PRIMARY KEY, source_revision bigint NOT NULL UNIQUE,
 status varchar(20) NOT NULL, created_at timestamptz NOT NULL
);
CREATE TABLE matches (
 id varchar(80) PRIMARY KEY, platform_id varchar(16) NOT NULL, game_id varchar(30) NOT NULL,
 state varchar(16) NOT NULL CHECK(state IN ('pending','registered','canceled')),
 started_at timestamptz NOT NULL, raw_json text NOT NULL, normalized_json text NOT NULL,
 created_at timestamptz NOT NULL, registered_revision bigint,
 UNIQUE(platform_id,game_id)
);
CREATE INDEX matches_order ON matches(state,started_at DESC,id DESC);
CREATE TABLE match_participants (
 id varchar(36) PRIMARY KEY, match_id varchar(80) NOT NULL REFERENCES matches(id),
 member_id varchar(36) NOT NULL REFERENCES members(id), puuid varchar(255) NOT NULL,
 team_id integer NOT NULL CHECK(team_id IN (100,200)), champion_id integer NOT NULL,
 win boolean NOT NULL, role varchar(16), UNIQUE(match_id,member_id), UNIQUE(match_id,puuid)
);
CREATE INDEX participants_filter ON match_participants(member_id,champion_id,role,win,match_id);
CREATE TABLE audit_log (
 id varchar(36) PRIMARY KEY, action varchar(60) NOT NULL, actor_id varchar(100) NOT NULL,
 target_id varchar(100) NOT NULL, details text NOT NULL, created_at timestamptz NOT NULL
);
CREATE TABLE enrollment_codes (
 id varchar(36) PRIMARY KEY, secret_hash varchar(64) NOT NULL UNIQUE,
 scope varchar(16) NOT NULL CHECK(scope IN ('admin','collector')), member_id varchar(36) REFERENCES members(id),
 expires_at timestamptz NOT NULL, consumed boolean NOT NULL, revoked boolean NOT NULL
);
CREATE TABLE admin_sessions (
 id varchar(36) PRIMARY KEY, secret_hash varchar(64) NOT NULL UNIQUE, csrf_hash varchar(64) NOT NULL,
 created_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL, revoked boolean NOT NULL
);
CREATE TABLE collector_credentials (
 id varchar(36) PRIMARY KEY, secret_hash varchar(64) NOT NULL UNIQUE,
 member_id varchar(36) NOT NULL REFERENCES members(id), created_at timestamptz NOT NULL, revoked boolean NOT NULL
);
