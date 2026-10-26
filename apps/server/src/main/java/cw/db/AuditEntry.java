package cw.db;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "audit_log")
public class AuditEntry {
    @Id public String id;
    public String action;
    public String actorId;
    public String targetId;

    @Column(columnDefinition = "text")
    public String details;

    public Instant createdAt;
}
