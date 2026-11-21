package cw.riot;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "solo_rank_snapshots")
public class SoloRankSnapshot {
    @Id public String playerId;
    public String status;
    public String tier;
    public String division;
    public double seedValue;
    public Instant observedAt;
    public Instant attemptedAt;
    public Instant nextAttemptAt;
}
