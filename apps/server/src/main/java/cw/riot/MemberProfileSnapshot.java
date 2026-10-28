package cw.riot;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "member_profile_snapshots")
public class MemberProfileSnapshot {
    @Id public String memberId;
    public String riotId;
    public Integer profileIconId;
    public Instant observedAt;
    public Instant nextAttemptAt;
}
