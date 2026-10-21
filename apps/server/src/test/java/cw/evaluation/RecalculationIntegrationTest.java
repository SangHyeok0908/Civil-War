package cw.evaluation;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.EvaluationContracts.*;
import cw.domain.ScoringRulesV1;
import cw.matches.AdminMatchService;
import cw.members.MemberService;
import cw.support.DatabaseTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class RecalculationIntegrationTest extends DatabaseTestSupport {
  @Autowired RecalculationWorker worker;
  @Autowired EvaluationRepository evaluations;
  @Autowired EvaluationSnapshot snapshot;
  @Autowired GenerationPublisher publisher;
  @Autowired AdminMatchService admin;
  @Autowired MemberService memberService;

  @Test
  void singleVersionEverywhere() {
    registered();
    assertThat(evaluations.current()).isNull();
    assertThat(worker.runOnce()).isTrue();
    var g = evaluations.current();
    assertThat(g.sourceRevision()).isEqualTo(revision());
    assertThat(g.gameScores()).hasSize(10);
    assertThat(g.memberStats()).hasSize(11);
    assertThat(g.roleSkills()).hasSize(55);
    assertThat(g.gameScores())
        .allSatisfy(s -> assertThat(s.scoringVersion()).isEqualTo(g.scoringVersion()));
    assertThat(
            jdbc.queryForObject(
                "select status from recalculation_jobs where source_revision=?",
                String.class,
                revision()))
        .isEqualTo("succeeded");
  }

  @Test
  void staleGenerationNeverPublishes() {
    registered();
    evaluations.claim(false);
    var old = snapshot.capture();
    admin.roles(KEY, roles(true));
    assertThat(evaluations.current()).isNull();
    assertThat(publisher.publish(old, worker.calculate(old), 1)).isFalse();
    assertThat(evaluations.current()).isNull();
    worker.runOnce();
    assertThat(evaluations.current().sourceRevision()).isEqualTo(revision());
  }

  @Test
  void desiredVersionGuardAndImmutableRules() {
    registered();
    evaluations.claim(false);
    var old = snapshot.capture();
    var d = ScoringRulesV1.defaults();
    var r =
        new ScoringRuleSet(
            "v2",
            d.algorithmVersion(),
            d.weightsByRole(),
            d.metricMix(),
            d.normalization(),
            d.cumulativePrior());
    evaluations.createRules(r);
    assertThat(evaluations.current()).isNull();
    assertThat(publisher.publish(old, worker.calculate(old), 1)).isFalse();
    worker.runOnce();
    assertThat(evaluations.current().scoringVersion()).isEqualTo("v2");
    assertThatThrownBy(
            () -> jdbc.update("update scoring_versions set rules_json='{}' where id='v2'"))
        .isInstanceOf(Exception.class);
  }

  @Test
  void desiredVersionGuardEvenIfRevisionEquals() {
    registered();
    evaluations.claim(false);
    var input = snapshot.capture();
    var d = ScoringRulesV1.defaults();
    evaluations.createRules(
        new ScoringRuleSet(
            "guard-v2",
            d.algorithmVersion(),
            d.weightsByRole(),
            d.metricMix(),
            d.normalization(),
            d.cumulativePrior()));
    jdbc.update("update service_state set source_revision=?", input.sourceRevision());
    assertThat(publisher.publish(input, worker.calculate(input), 1)).isFalse();
    assertThat(evaluations.current()).isNull();
  }

  @Test
  void cancelDuringCalculation() {
    registered();
    evaluations.claim(false);
    var input = snapshot.capture();
    admin.cancel(KEY);
    assertThat(publisher.publish(input, worker.calculate(input), 1)).isFalse();
    worker.runOnce();
    assertThat(evaluations.current().gameScores()).isEmpty();
    assertThat(evaluations.current().memberStats()).allSatisfy(s -> assertThat(s.games()).isZero());
  }

  @Test
  void workerRestart() {
    registered();
    jdbc.update("update recalculation_jobs set status='running'");
    worker.runOnce();
    assertThat(evaluations.current()).isNotNull();
  }

  @Test
  void failureIsInvisibleAndRetryRecovers() {
    registered();
    jdbc.execute(
        "CREATE FUNCTION fail_generation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE"
            + " EXCEPTION 'injected'; END $$");
    jdbc.execute(
        "CREATE TRIGGER fail_generation BEFORE INSERT ON evaluation_generations FOR EACH ROW"
            + " EXECUTE FUNCTION fail_generation()");
    try {
      worker.runOnce();
      assertThat(evaluations.current()).isNull();
      assertThat(
              jdbc.queryForObject(
                  "select status from recalculation_jobs where source_revision=?",
                  String.class,
                  revision()))
          .isEqualTo("failed");
    } finally {
      jdbc.execute("DROP TRIGGER fail_generation ON evaluation_generations");
      jdbc.execute("DROP FUNCTION fail_generation()");
    }
    evaluations.retry();
    worker.runOnce();
    assertThat(evaluations.current()).isNotNull();
  }

  @Test
  void seedDoesNotAlterPublicScoresAndNamesAreLive() {
    registered();
    worker.runOnce();
    var scores = evaluations.current().gameScores();
    memberService.patch("member-1", json.readTree("{\"seedSkill\":99}"));
    assertThat(evaluations.current()).isNull();
    worker.runOnce();
    assertThat(evaluations.current().gameScores()).isEqualTo(scores);
    long rev = revision();
    memberService.patch("member-1", json.readTree("{\"displayName\":\"새 이름\"}"));
    assertThat(revision()).isEqualTo(rev);
    assertThat(evaluations.rankings().toString()).contains("새 이름");
  }

  @Test
  void mutationBetweenClaimAndSnapshotKeepsOwnership() {
    registered();
    var claimed = evaluations.claim(false);
    admin.roles(KEY, roles(true));
    worker.calculateClaimed(claimed);
    assertThat(evaluations.current()).isNull();
    assertThat(
            jdbc.queryForObject(
                "select status from recalculation_jobs where source_revision=?",
                String.class,
                claimed.sourceRevision()))
        .isEqualTo("stale");
    assertThat(
            jdbc.queryForObject(
                "select attempts from recalculation_jobs where source_revision=?",
                Integer.class,
                revision()))
        .isZero();
    worker.runOnce();
    assertThat(evaluations.current().sourceRevision()).isEqualTo(revision());
  }

  @Test
  void recoveredClaimFencesOldAttempt() {
    registered();
    var first = evaluations.claim(false);
    var input = snapshot.capture();
    var second = evaluations.claim(false);
    assertThat(publisher.publish(input, worker.calculate(input), first.attempts())).isFalse();
    evaluations.failed(first);
    assertThat(
            jdbc.queryForObject(
                "select status from recalculation_jobs where source_revision=?",
                String.class,
                revision()))
        .isEqualTo("running");
    worker.calculateClaimed(second);
    assertThat(evaluations.current()).isNotNull();
  }

  @Test
  void singleWorkerClaim() throws Exception {
    registered();
    try (var c = jdbc.getDataSource().getConnection();
        var s = c.createStatement()) {
      s.execute("select pg_advisory_lock(731954801)");
      assertThat(worker.runOnce()).isFalse();
      assertThat(evaluations.current()).isNull();
      s.execute("select pg_advisory_unlock(731954801)");
    }
    assertThat(worker.runOnce()).isTrue();
  }
}
