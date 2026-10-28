package cw.evaluation;

import cw.contracts.ApiException;
import cw.contracts.MatchContracts.CollectorPrincipal;
import cw.db.RecalculationJob;
import cw.db.ServiceState;
import cw.matches.MatchRepository;
import cw.matches.MatchViews;
import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class CollectorProgressQuery {
    @PersistenceContext private EntityManager em;
    private final MatchRepository matches;
    private final MatchViews views;
    private final Clock clock;

    public CollectorProgressQuery(MatchRepository matches, MatchViews views, Clock clock) {
        this.matches = matches;
        this.views = views;
        this.clock = clock;
    }

    public record EvaluationProgress(
            String status, long targetRevision, String scoringVersion, Instant observedAt) {}

    public record Progress(
            String matchKey,
            String registrationState,
            EvaluationProgress evaluation,
            Long registeredRevision) {}

    public List<Progress> get(List<String> keys, CollectorPrincipal actor) {
        if (keys == null
                || keys.size() > 100
                || keys.stream()
                        .anyMatch(k -> k == null || !k.matches("[A-Z0-9]{1,16}:[0-9]{1,30}")))
            throw new ApiException(422, "INVALID_REQUEST");
        var records =
                keys.stream()
                        .distinct()
                        .map(
                                k ->
                                        matches.findById(k)
                                                .orElseThrow(
                                                        () -> new ApiException(403, "FORBIDDEN")))
                        .toList();
        records.forEach(m -> views.requireParticipant(m, actor));
        ServiceState state = em.find(ServiceState.class, 1);
        var g =
                state.activeGenerationId == null
                        ? null
                        : em.find(GenerationEntity.class, state.activeGenerationId);
        String status = "unknown";
        if (g != null
                && g.sourceRevision == state.sourceRevision
                && Objects.equals(g.scoringVersion, state.desiredScoringVersion)) status = "ready";
        else {
            var jobs =
                    em.createQuery(
                                    "from RecalculationJob where sourceRevision=:r",
                                    RecalculationJob.class)
                            .setParameter("r", state.sourceRevision)
                            .getResultList();
            if (jobs.isEmpty()) status = "queued";
            else {
                var job = jobs.getFirst();
                if (job.scoringVersion != null
                        && !Objects.equals(job.scoringVersion, state.desiredScoringVersion))
                    status = "queued";
                else if (job.status.equals("pending")) status = "queued";
                else if (job.status.equals("failed")) status = "failed";
                else if (job.status.equals("running")) {
                    boolean live =
                            Boolean.TRUE.equals(
                                    em.createNativeQuery(
                                                    "select exists(select 1 from pg_locks where locktype='advisory' and classid=0 and objid=731954801 and objsubid=1 and granted and database=(select oid from pg_database where datname=current_database()))",
                                                    Boolean.class)
                                            .getSingleResult());
                    status = live ? "running" : "unknown";
                }
            }
        }
        var evaluation =
                new EvaluationProgress(
                        status, state.sourceRevision, state.desiredScoringVersion, clock.instant());
        return records.stream()
                .map(m -> new Progress(m.id, m.state, evaluation, m.registeredRevision))
                .toList();
    }
}
