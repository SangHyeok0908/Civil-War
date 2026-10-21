package cw.members;

import cw.contracts.Role;
import jakarta.persistence.*;
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
