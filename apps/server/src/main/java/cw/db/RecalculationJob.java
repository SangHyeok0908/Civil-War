package cw.db;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "recalculation_jobs")
public class RecalculationJob {
    @Id public String id;
    public long sourceRevision;
    public String status;
    public Instant createdAt;
    public String scoringVersion;
    public int attempts;
    public Instant claimedAt;
    public Instant completedAt;
    public String errorCode;
}
