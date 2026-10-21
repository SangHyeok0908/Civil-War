package cw.db;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name="recalculation_jobs")
public class RecalculationJob {
    @Id public String id;
    public long sourceRevision;
    public String status;
    public Instant createdAt;
}
