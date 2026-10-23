package cw.db;

import jakarta.persistence.*;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

@Component
@Transactional(propagation = Propagation.MANDATORY)
public class MutationCoordinator {
    @PersistenceContext private EntityManager em;
    private final Clock clock;

    public MutationCoordinator(Clock clock) {
        this.clock = clock;
    }

    public ServiceState lock() {
        return em.find(ServiceState.class, 1, LockModeType.PESSIMISTIC_WRITE);
    }

    public long changed(ServiceState state) {
        state.sourceRevision++;
        state.activeGenerationId = null;
        var job = new RecalculationJob();
        job.id = UUID.randomUUID().toString();
        job.sourceRevision = state.sourceRevision;
        job.status = "pending";
        job.createdAt = clock.instant();
        em.persist(job);
        return state.sourceRevision;
    }

    public void audit(String action, String actor, String target, String details) {
        var entry = new AuditEntry();
        entry.id = UUID.randomUUID().toString();
        entry.action = action;
        entry.actorId = actor;
        entry.targetId = target;
        entry.details = details;
        entry.createdAt = clock.instant();
        em.persist(entry);
    }
}
