package cw.evaluation;

import cw.contracts.EvaluationContracts.EvaluationGeneration;
import cw.contracts.EvaluationContracts.EvaluationInput;
import cw.db.MutationCoordinator;
import cw.db.ServiceState;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Service
public class GenerationPublisher {
    @PersistenceContext private EntityManager em;
    private final MutationCoordinator mutations;
    private final JsonMapper json;
    private final Clock clock;

    public GenerationPublisher(MutationCoordinator mutations, JsonMapper json, Clock clock) {
        this.mutations = mutations;
        this.json = json;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean publish(
            EvaluationInput input, EvaluationGeneration generation, int expectedAttempt) {
        ServiceState state = mutations.lock();
        long owned =
                em.createQuery(
                                "select count(j) from RecalculationJob j where j.sourceRevision=:r and"
                                        + " j.status='running' and j.attempts=:attempts and j.scoringVersion=:version",
                                Long.class)
                        .setParameter("r", input.sourceRevision())
                        .setParameter("attempts", expectedAttempt)
                        .setParameter("version", input.scoringVersion())
                        .getSingleResult();

        if (owned != 1) {
            return false;
        }

        if (state.sourceRevision != input.sourceRevision()
                || !input.scoringVersion().equals(state.desiredScoringVersion)) {
            em.createQuery(
                            "update RecalculationJob set status='stale' where sourceRevision=:r and"
                                    + " status='running'")
                    .setParameter("r", input.sourceRevision())
                    .executeUpdate();
            return false;
        }

        if (generation.sourceRevision() != input.sourceRevision()
                || !generation.scoringVersion().equals(input.scoringVersion())) {
            throw new IllegalArgumentException("Generation mismatch");
        }

        GenerationEntity g = new GenerationEntity();
        g.id = generation.id();
        g.sourceRevision = input.sourceRevision();
        g.scoringVersion = input.scoringVersion();
        g.resultJson = json.writeValueAsString(generation);
        g.createdAt = clock.instant();

        em.persist(g);

        state.activeGenerationId = g.id;

        em.createQuery(
                        "update RecalculationJob set status='succeeded',completedAt=:now,errorCode=null where"
                                + " sourceRevision=:r")
                .setParameter("r", input.sourceRevision())
                .setParameter("now", clock.instant())
                .executeUpdate();

        return true;
    }
}
