-- Keep immutable historical rules/results and all match inputs. Only the selected legacy rule
-- becomes a new confirmed version; the existing worker rebuilds every registered match.
DO $$
DECLARE
    previous_id text;
    previous_rules jsonb;
    confirmed_id text;
    next_revision bigint;
BEGIN
    SELECT s.desired_scoring_version, v.rules_json::jsonb
      INTO previous_id, previous_rules
      FROM service_state s
      LEFT JOIN scoring_versions v ON v.id = s.desired_scoring_version
     WHERE s.id = 1
     FOR UPDATE OF s;

    IF previous_rules->>'algorithmVersion' = 'objective-provisional-v1' THEN
        confirmed_id := 'objective-position-v1-' || md5(previous_id);
        INSERT INTO scoring_versions(id, rules_json, created_at)
        VALUES (confirmed_id,
                (previous_rules || jsonb_build_object(
                    'id', confirmed_id, 'algorithmVersion', 'objective-position-v1'))::text,
                CURRENT_TIMESTAMP);

        UPDATE service_state
           SET desired_scoring_version = confirmed_id,
               source_revision = source_revision + 1,
               active_generation_id = NULL
         WHERE id = 1
         RETURNING source_revision INTO next_revision;

        INSERT INTO recalculation_jobs(id, source_revision, status, created_at)
        VALUES (gen_random_uuid()::text, next_revision, 'pending', CURRENT_TIMESTAMP);

        INSERT INTO audit_log(id, action, actor_id, target_id, details, created_at)
        VALUES (gen_random_uuid()::text, 'scoring_version_confirmed', 'system', confirmed_id,
                jsonb_build_object('previousVersion', previous_id)::text, CURRENT_TIMESTAMP);
    END IF;
END $$;
