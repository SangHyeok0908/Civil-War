package cw.evaluation;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "scoring_versions")
public class ScoringVersionEntity {
  @Id public String id;
  public String rulesJson;
  public Instant createdAt;
}
