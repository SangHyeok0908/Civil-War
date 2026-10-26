package cw.db;
import jakarta.persistence.*;
@Entity @Table(name="service_state")
public class ServiceState {
    @Id public Integer id;
    public long sourceRevision;
    public String desiredScoringVersion;
    public String activeGenerationId;
}
