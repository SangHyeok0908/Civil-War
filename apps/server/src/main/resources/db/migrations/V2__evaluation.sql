CREATE TABLE scoring_versions (
 id varchar(100) PRIMARY KEY, rules_json text NOT NULL, created_at timestamptz NOT NULL
);
CREATE TABLE evaluation_generations (
 id varchar(36) PRIMARY KEY, source_revision bigint NOT NULL, scoring_version varchar(100) NOT NULL REFERENCES scoring_versions(id),
 result_json text NOT NULL, created_at timestamptz NOT NULL
);
ALTER TABLE recalculation_jobs ADD COLUMN scoring_version varchar(100);
ALTER TABLE recalculation_jobs ADD COLUMN attempts integer NOT NULL DEFAULT 0;
ALTER TABLE recalculation_jobs ADD COLUMN claimed_at timestamptz;
ALTER TABLE recalculation_jobs ADD COLUMN completed_at timestamptz;
ALTER TABLE recalculation_jobs ADD COLUMN error_code varchar(60);
CREATE FUNCTION prevent_scoring_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'scoring versions are immutable'; END $$;
CREATE TRIGGER immutable_scoring BEFORE UPDATE OR DELETE ON scoring_versions FOR EACH ROW EXECUTE FUNCTION prevent_scoring_rewrite();
CREATE TRIGGER immutable_generation BEFORE UPDATE OR DELETE ON evaluation_generations FOR EACH ROW EXECUTE FUNCTION prevent_scoring_rewrite();
