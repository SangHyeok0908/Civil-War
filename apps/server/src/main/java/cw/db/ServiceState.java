package cw.db;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "service_state")
public class ServiceState {
    @Id public Integer id;
    public long sourceRevision;
    public String desiredScoringVersion;
    public String activeGenerationId;
}
