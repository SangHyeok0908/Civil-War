export const migration = `
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  member_id TEXT NOT NULL,
  puuid TEXT NOT NULL,
  match_key TEXT NOT NULL,
  record TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, match_key)
);

CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  puuid TEXT NOT NULL,
  match_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ingest', 'confirm')),
  state TEXT NOT NULL,
  payload TEXT NOT NULL,
  dependency INTEGER REFERENCES outbox(id),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS unfinished
  ON outbox(member_id, match_key, kind)
  WHERE state != 'succeeded';

CREATE TABLE IF NOT EXISTS rotations (
  member_id TEXT NOT NULL,
  puuid TEXT NOT NULL,
  old_credential TEXT NOT NULL,
  new_credential TEXT NOT NULL,
  PRIMARY KEY (member_id, puuid, old_credential, new_credential)
);

PRAGMA user_version = 1;
`;
