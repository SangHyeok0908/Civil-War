package cw.auth;

import cw.db.AuditEntry;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Transactional(readOnly = true)
public class AdminReadController {
    @PersistenceContext private EntityManager em;

    @GetMapping("/api/admin/audit")
    public Object audit() {
        return em.createQuery("from AuditEntry order by createdAt desc,id", AuditEntry.class)
                .setMaxResults(100)
                .getResultList();
    }
}
