package cw.evaluation;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "evaluation_generations")
public class GenerationEntity {
    @Id public String id;
    public long sourceRevision;
    public String scoringVersion;
    public String resultJson;
    public Instant createdAt;
}
