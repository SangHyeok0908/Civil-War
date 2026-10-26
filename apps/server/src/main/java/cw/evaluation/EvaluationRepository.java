package cw.evaluation;

import cw.contracts.ApiException;
import cw.contracts.EvaluationContracts.EvaluationGeneration;
import cw.contracts.EvaluationContracts.MemberStats;
import cw.contracts.EvaluationContracts.ScoringRuleSet;
import cw.contracts.MemberContracts.PublicMember;
import cw.db.MutationCoordinator;
import cw.db.RecalculationJob;
import cw.db.ServiceState;
import cw.domain.ScoringRulesV1;
import cw.members.MemberService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class EvaluationRepository {
    @PersistenceContext private EntityManager em;
    private final MutationCoordinator mutations;
    private final JsonMapper json;
    private final MemberService members;
    private final Clock clock;

    public EvaluationRepository(
            MutationCoordinator mutations, JsonMapper json, MemberService members, Clock clock) {
        this.mutations = mutations;
        this.json = json;
        this.members = members;
        this.clock = clock;
    }

    public EvaluationGeneration current() {
        ServiceState s = em.find(ServiceState.class, 1);

        if (s.activeGenerationId == null) {
            return null;
        }

        GenerationEntity g = em.find(GenerationEntity.class, s.activeGenerationId);

        if (g == null
                || g.sourceRevision != s.sourceRevision
                || !g.scoringVersion.equals(s.desiredScoringVersion)) {
            return null;
        }

        return json.readValue(g.resultJson, EvaluationGeneration.class);
    }

    public record RankingRow(String displayName, MemberStats stats) {}

    public Object rankings() {
        EvaluationGeneration g = current();

        if (g == null) {
            throw new ApiException(202, "RECALCULATING");
        }

        HashMap<String, String> names = new HashMap<String, String>();
        members.publicList().forEach(m -> names.put(m.id(), m.displayName()));

        return Map.of(
                "status",
                "ready",
                "generationId",
                g.id(),
                "sourceRevision",
                g.sourceRevision(),
                "scoringVersion",
                g.scoringVersion(),
                "members",
                g.memberStats().stream()
                        .map(s -> new RankingRow(names.get(s.memberId()), s))
                        .toList());
    }

    public Object stats(String id) {
        PublicMember member =
                members.publicList().stream()
                        .filter(m -> m.id().equals(id))
                        .findFirst()
                        .orElseThrow(() -> new ApiException(404, "NOT_FOUND"));
        EvaluationGeneration g = current();

        if (g == null) {
            throw new ApiException(202, "RECALCULATING");
        }

        return Map.of(
                "member",
                member,
                "stats",
                g.memberStats().stream()
                        .filter(s -> s.memberId().equals(id))
                        .findFirst()
                        .orElseThrow(),
                "generationId",
                g.id(),
                "sourceRevision",
                g.sourceRevision(),
                "scoringVersion",
                g.scoringVersion());
    }

    public ScoringRuleSet rule(String id) {
        ScoringVersionEntity entity = em.find(ScoringVersionEntity.class, id);

        if (entity == null) {
            throw new ApiException(404, "NOT_FOUND");
        }

        return json.readValue(entity.rulesJson, ScoringRuleSet.class);
    }

    public List<ScoringRuleSet> rules() {
        return em
                .createQuery(
                        "from ScoringVersionEntity order by createdAt,id",
                        ScoringVersionEntity.class)
                .getResultList()
                .stream()
                .map(v -> json.readValue(v.rulesJson, ScoringRuleSet.class))
                .toList();
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ScoringRuleSet createRules(ScoringRuleSet rules) {
        ScoringRulesV1.validateNewVersion(rules);

        ServiceState state = mutations.lock();

        if (em.find(ScoringVersionEntity.class, rules.id()) != null) {
            throw new ApiException(409, "CONFLICT");
        }

        saveRule(rules);

        state.desiredScoringVersion = rules.id();

        mutations.changed(state);
        mutations.audit("scoring_version_created", "owner", rules.id(), "{}");

        return rules;
    }

    private void saveRule(ScoringRuleSet rules) {
        ScoringVersionEntity e = new ScoringVersionEntity();
        e.id = rules.id();
        e.rulesJson = json.writeValueAsString(rules);
        e.createdAt = clock.instant();

        em.persist(e);
    }

    public record Claim(long sourceRevision, String scoringVersion, int attempts) {}

    @Transactional(isolation = Isolation.READ_COMMITTED, propagation = Propagation.REQUIRES_NEW)
    public Claim claim(boolean recoverFailed) {
        ServiceState state = mutations.lock();

        if (state.desiredScoringVersion == null) {
            ScoringRuleSet d = ScoringRulesV1.defaults();

            if (em.find(ScoringVersionEntity.class, d.id()) == null) {
                saveRule(d);
            }

            state.desiredScoringVersion = d.id();
        }

        // Caller holds a PostgreSQL session advisory lock. No other live worker can own these jobs.
        em.createQuery("update RecalculationJob set status='pending' where status='running'")
                .executeUpdate();
        em.createQuery(
                        "update RecalculationJob set status='stale' where status='pending' and"
                                + " sourceRevision<>:revision")
                .setParameter("revision", state.sourceRevision)
                .executeUpdate();

        List<RecalculationJob> rows =
                em.createQuery(
                                "from RecalculationJob where sourceRevision=:revision",
                                RecalculationJob.class)
                        .setParameter("revision", state.sourceRevision)
                        .getResultList();
        RecalculationJob job;

        if (rows.isEmpty()) {
            if (state.activeGenerationId != null) {
                return null;
            }

            job = new RecalculationJob();
            job.id = UUID.randomUUID().toString();
            job.sourceRevision = state.sourceRevision;
            job.status = "pending";
            job.createdAt = clock.instant();

            em.persist(job);
        } else {
            job = rows.getFirst();
        }

        if (recoverFailed && job.status.equals("failed")) {
            job.status = "pending";
        }

        if (!job.status.equals("pending")) {
            return null;
        }

        job.status = "running";
        job.scoringVersion = state.desiredScoringVersion;
        job.attempts++;
        job.claimedAt = clock.instant();
        job.errorCode = null;

        return new Claim(job.sourceRevision, job.scoringVersion, job.attempts);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, propagation = Propagation.REQUIRES_NEW)
    public void stale(Claim claim) {
        em.createQuery(
                        "update RecalculationJob set status='stale' where sourceRevision=:r and"
                                + " status='running' and attempts=:attempts")
                .setParameter("attempts", claim.attempts())
                .setParameter("r", claim.sourceRevision())
                .executeUpdate();
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, propagation = Propagation.REQUIRES_NEW)
    public void failed(Claim claim) {
        em.createQuery(
                        "update RecalculationJob set status='failed',errorCode='CALCULATION_FAILED' where"
                                + " sourceRevision=:revision and status='running' and attempts=:attempts")
                .setParameter("attempts", claim.attempts())
                .setParameter("revision", claim.sourceRevision())
                .executeUpdate();
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void retry() {
        ServiceState s = mutations.lock();
        em.createQuery(
                        "update RecalculationJob set status='pending',errorCode=null where"
                                + " sourceRevision=:revision and status='failed'")
                .setParameter("revision", s.sourceRevision)
                .executeUpdate();
        mutations.audit("recalculation_retry", "owner", Long.toString(s.sourceRevision), "{}");
    }

    public Object jobs() {
        return em.createQuery(
                        "from RecalculationJob order by sourceRevision desc",
                        RecalculationJob.class)
                .setMaxResults(100)
                .getResultList();
    }
}
