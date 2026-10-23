package cw.members;

import cw.contracts.Role;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "role_reference_samples")
public class ReferenceSampleEntity {
    @Id public String id;
    public String memberId;
    public String source;
    public String gameId;
    public Instant playedAt;

    @Enumerated(EnumType.STRING)
    public Role role;

    public String evidenceJson;
}
