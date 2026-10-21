package cw.members;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "member_reference_links")
public class ReferenceLinkEntity {
  @Id public String memberId;
  public String officialPuuid;
  public Instant confirmedAt;
}
