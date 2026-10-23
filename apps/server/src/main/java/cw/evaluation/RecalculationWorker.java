package cw.evaluation;

import cw.contracts.EvaluationContracts.*;
import cw.domain.*;
import java.util.UUID;
import javax.sql.DataSource;
import org.springframework.stereotype.Service;

/**
 * Session advisory lock spans claim, snapshot, CPU work and publication. Connection death releases
 * it.
 */
@Service
public class RecalculationWorker {
    private final DataSource dataSource;
    private final EvaluationRepository evaluations;
    private final EvaluationSnapshot snapshot;
    private final GenerationPublisher publisher;

    public RecalculationWorker(
            DataSource dataSource,
            EvaluationRepository evaluations,
            EvaluationSnapshot snapshot,
            GenerationPublisher publisher) {
        this.dataSource = dataSource;
        this.evaluations = evaluations;
        this.snapshot = snapshot;
        this.publisher = publisher;
    }

    public EvaluationGeneration calculate(EvaluationInput input) {
        var scores = new ScoringService().scoreMatches(input);
        return new EvaluationGeneration(
                UUID.randomUUID().toString(),
                input.sourceRevision(),
                input.scoringVersion(),
                scores,
                new MemberAggregator().aggregate(input, scores),
                new RoleSkillCalculator().calculate(input.members(), scores));
    }

    void calculateClaimed(EvaluationRepository.Claim claim) {
        var input = snapshot.capture();
        if (input.sourceRevision() != claim.sourceRevision()
                || !input.scoringVersion().equals(claim.scoringVersion())) {
            evaluations.stale(claim);
            return;
        }
        publisher.publish(input, calculate(input), claim.attempts());
    }

    public boolean runOnce() {
        return runOnce(false);
    }

    public boolean runOnce(boolean recoverFailed) {
        try (var connection = dataSource.getConnection();
                var statement = connection.createStatement()) {
            try (var result = statement.executeQuery("select pg_try_advisory_lock(731954801)")) {
                result.next();
                if (!result.getBoolean(1)) {
                    return false;
                }
            }
            try {
                var revision = evaluations.claim(recoverFailed);
                if (revision == null) {
                    return false;
                }
                try {
                    calculateClaimed(revision);
                } catch (Exception failure) {
                    evaluations.failed(revision);
                }
                return true;
            } finally {
                statement.execute("select pg_advisory_unlock(731954801)");
            }
        } catch (java.sql.SQLException e) {
            throw new IllegalStateException("Evaluation database unavailable", e);
        }
    }
}
