package cw.auth;

import cw.db.AuditEntry;
import jakarta.persistence.*;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@Transactional(readOnly = true)
public class AdminReadController {
    @PersistenceContext private EntityManager em;

    public record CodeView(
            String id,
            String scope,
            String memberId,
            java.time.Instant expiresAt,
            boolean consumed,
            boolean revoked) {}

    @GetMapping("/api/admin/codes")
    public Object codes() {
        return em
                .createQuery("from EnrollmentCode order by expiresAt desc", EnrollmentCode.class)
                .setMaxResults(100)
                .getResultList()
                .stream()
                .map(
                        c ->
                                new CodeView(
                                        c.id,
                                        c.scope,
                                        c.memberId,
                                        c.expiresAt,
                                        c.consumed,
                                        c.revoked))
                .toList();
    }

    @GetMapping("/api/admin/audit")
    public Object audit() {
        return em.createQuery("from AuditEntry order by createdAt desc,id", AuditEntry.class)
                .setMaxResults(100)
                .getResultList();
    }
}
