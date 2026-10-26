package cw.evaluation;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.EvaluationContracts.EvaluationGeneration;
import cw.contracts.EvaluationContracts.ScoringRuleSet;
import cw.contracts.MatchContracts.ConfirmationInput;
import cw.contracts.MatchContracts.IngestMatchInput;
import cw.contracts.Role;
import cw.domain.ScoringRulesV1;
import cw.matches.AdminMatchService;
import cw.support.DatabaseTestSupport;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.node.ObjectNode;

class ConfirmedScoringMigrationIntegrationTest extends DatabaseTestSupport {
    @Autowired RecalculationWorker worker;
    @Autowired EvaluationRepository evaluations;
    @Autowired AdminMatchService admin;

    private void migrate() throws Exception {
        jdbc.execute(
                new ClassPathResource("db/migrations/V4__confirmed_objective.sql")
                        .getContentAsString(StandardCharsets.UTF_8));
    }

    private ScoringRuleSet legacy(boolean custom) {
        ScoringRuleSet d = ScoringRulesV1.defaults();
        Map<Role, Map<String, Double>> weights = new EnumMap<>(d.weightsByRole());
        Map<String, Double> top = new LinkedHashMap<>(weights.get(Role.TOP));
        if (custom) {
            top.put("damage", 21.);
            top.put("growth", 24.);
            weights.put(Role.TOP, top);
        }
        ObjectNode mix = (ObjectNode) d.metricMix().deepCopy();
        if (custom) {
            mix.put("damagePerMinute", .6);
            mix.put("damageShare", .4);
        }
        ScoringRuleSet old =
                new ScoringRuleSet(
                        custom ? "owner-custom" : "objective-provisional-v1",
                        "objective-provisional-v1",
                        weights,
                        mix,
                        d.normalization(),
                        d.cumulativePrior());
        jdbc.update(
                "insert into scoring_versions(id,rules_json,created_at) values(?,?,now())",
                old.id(),
                json.writeValueAsString(old));
        jdbc.update("update service_state set desired_scoring_version=? where id=1", old.id());
        // Compare persisted JSON values using the same exact-decimal input representation.
        return json.readValue(json.writeValueAsString(old), ScoringRuleSet.class);
    }

    private String store(ObjectNode raw, boolean register) {
        String key = "KR:" + raw.get("gameId").asString();
        ingest.ingestMatch(new IngestMatchInput(raw, "ingest-" + key, 1), actor(1));
        if (register) {
            registration.registerMatch(
                    new ConfirmationInput(key, roles(false), "confirm-" + key), actor(1));
        }
        return key;
    }

    @Test
    void upgradesSelectedCustomRulesAndRecalculatesEveryValidStoredMatch() throws Exception {
        for (String file : java.util.List.of("G1.json", "G2.json", "G3.json")) {
            store(
                    (ObjectNode)
                            json.readTree(
                                    Files.readString(
                                            Path.of(System.getProperty("cw.fixtureRoot"), file))),
                    true);
        }
        ObjectNode canceled = raw();
        canceled.put("gameId", "9000000000000000000004");
        admin.cancel(store(canceled, true));
        ObjectNode pending = raw();
        pending.put("gameId", "9000000000000000000005");
        store(pending, false);
        ScoringRuleSet old = legacy(true);
        assertThat(worker.runOnce()).isTrue();
        EvaluationGeneration previous = evaluations.current();
        assertThat(previous.gameScores()).hasSize(30);
        List<Map<String, Object>> originals =
                jdbc.queryForList(
                        "select id,raw_json,normalized_json,state from matches order by id");
        List<Map<String, Object>> participants =
                jdbc.queryForList("select * from match_participants order by id");
        String oldRules =
                jdbc.queryForObject(
                        "select rules_json from scoring_versions where id=?",
                        String.class,
                        old.id());
        String oldGeneration =
                jdbc.queryForObject(
                        "select result_json from evaluation_generations where id=?",
                        String.class,
                        previous.id());
        long before = revision();

        migrate();
        assertThat(revision()).isEqualTo(before + 1);
        assertThat(evaluations.current()).isNull();
        assertThatThrownBy(() -> evaluations.rankings())
                .isInstanceOf(cw.contracts.ApiException.class);
        assertThat(
                        jdbc.queryForObject(
                                "select status from recalculation_jobs where source_revision=?",
                                String.class,
                                revision()))
                .isEqualTo("pending");
        String nextId =
                jdbc.queryForObject(
                        "select desired_scoring_version from service_state", String.class);
        ScoringRuleSet next = evaluations.rule(nextId);
        assertThat(next.algorithmVersion()).isEqualTo("objective-position-v1");
        assertThat(next.weightsByRole()).isEqualTo(old.weightsByRole());
        assertThat(next.metricMix()).isEqualTo(old.metricMix());
        assertThat(next.normalization()).isEqualTo(old.normalization());
        assertThat(next.cumulativePrior()).isEqualTo(old.cumulativePrior());
        assertThat(evaluations.rule(old.id())).isEqualTo(old);

        assertThat(worker.runOnce()).isTrue();
        EvaluationGeneration current = evaluations.current();
        assertThat(current.scoringVersion()).isEqualTo(nextId);
        assertThat(current.gameScores())
                .hasSize(30)
                .allSatisfy(s -> assertThat(s.scoringVersion()).isEqualTo(nextId));
        assertThat(current.gameScores())
                .extracting(
                        s -> tuple(s.matchKey(), s.memberId(), s.score(), s.rank(), s.breakdown()))
                .containsExactlyElementsOf(
                        previous.gameScores().stream()
                                .map(
                                        s ->
                                                tuple(
                                                        s.matchKey(),
                                                        s.memberId(),
                                                        s.score(),
                                                        s.rank(),
                                                        s.breakdown()))
                                .toList());
        assertThat(current.memberStats()).isEqualTo(previous.memberStats());
        assertThat(current.roleSkills()).isEqualTo(previous.roleSkills());
        assertThat(
                        jdbc.queryForList(
                                "select id,raw_json,normalized_json,state from matches order by id"))
                .isEqualTo(originals);
        assertThat(jdbc.queryForList("select * from match_participants order by id"))
                .isEqualTo(participants);
        assertThat(
                        jdbc.queryForObject(
                                "select rules_json from scoring_versions where id=?",
                                String.class,
                                old.id()))
                .isEqualTo(oldRules);
        assertThat(
                        jdbc.queryForObject(
                                "select result_json from evaluation_generations where id=?",
                                String.class,
                                previous.id()))
                .isEqualTo(oldGeneration);
        assertThat(
                        jdbc.queryForObject(
                                "select status from recalculation_jobs where source_revision=?",
                                String.class,
                                revision()))
                .isEqualTo("succeeded");
        long jobs = jobs();
        migrate();
        assertThat(revision()).isEqualTo(before + 1);
        assertThat(jobs()).isEqualTo(jobs);
        assertThat(evaluations.current()).isEqualTo(current);
        assertThat(worker.runOnce()).isFalse();

        Files.writeString(
                Path.of("build/reports/confirmed-objective-generation.json"),
                json.writeValueAsString(Map.of("rules", next, "generation", current)));
    }

    @Test
    void upgradesLegacyDefaultWithoutAnActiveGeneration() throws Exception {
        ScoringRuleSet old = legacy(false);
        migrate();
        assertThat(revision()).isEqualTo(1);
        assertThat(worker.runOnce()).isTrue();
        EvaluationGeneration current = evaluations.current();
        assertThat(evaluations.rule(current.scoringVersion()).algorithmVersion())
                .isEqualTo("objective-position-v1");
        assertThat(evaluations.rule(old.id())).isEqualTo(old);
        assertThat(current.gameScores()).isEmpty();
    }

    @Test
    void freshDatabaseStartsConfirmedAndDoesNotUpgradeAgain() throws Exception {
        migrate();
        assertThat(revision()).isZero();
        assertThat(worker.runOnce()).isTrue();
        EvaluationGeneration current = evaluations.current();
        assertThat(evaluations.rule(current.scoringVersion()).algorithmVersion())
                .isEqualTo("objective-position-v1");
        migrate();
        assertThat(revision()).isZero();
        assertThat(evaluations.current()).isEqualTo(current);
    }

    @Test
    void migrationFailureLeavesSelectedRulesRevisionAndJobsUnchanged() throws Exception {
        ScoringRuleSet old = legacy(false);
        jdbc.execute(
                "CREATE FUNCTION fail_confirmed_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$");
        jdbc.execute(
                "CREATE TRIGGER fail_confirmed_job BEFORE INSERT ON recalculation_jobs FOR EACH ROW EXECUTE FUNCTION fail_confirmed_job()");
        try {
            assertThatThrownBy(this::migrate)
                    .isInstanceOf(org.springframework.dao.DataAccessException.class);
        } finally {
            jdbc.execute("DROP TRIGGER fail_confirmed_job ON recalculation_jobs");
            jdbc.execute("DROP FUNCTION fail_confirmed_job()");
        }
        assertThat(revision()).isZero();
        assertThat(jobs()).isZero();
        assertThat(evaluations.rules()).containsExactly(old);
        assertThat(
                        jdbc.queryForObject(
                                "select desired_scoring_version from service_state", String.class))
                .isEqualTo(old.id());
        migrate();
        assertThat(worker.runOnce()).isTrue();
    }
}
