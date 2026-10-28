CREATE TABLE group_collector_code (
 id integer PRIMARY KEY CHECK(id=1),
 secret_hash varchar(64), generation bigint NOT NULL,
 issued_at timestamptz
);
INSERT INTO group_collector_code(id,generation) VALUES(1,1);
ALTER TABLE collector_credentials ADD COLUMN code_generation bigint NOT NULL DEFAULT 0;
UPDATE collector_credentials SET revoked=true;
UPDATE enrollment_codes SET revoked=true WHERE scope='collector' OR (scope='admin' AND NOT consumed);
CREATE TABLE auth_attempts (
 bucket varchar(300) PRIMARY KEY, attempts integer NOT NULL, started_at timestamptz NOT NULL
);
