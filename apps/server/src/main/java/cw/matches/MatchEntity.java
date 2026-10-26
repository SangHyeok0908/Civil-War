package cw.matches;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(
        name = "matches",
        uniqueConstraints = @UniqueConstraint(columnNames = {"platform_id", "game_id"}))
public class MatchEntity {
    @Id public String id;
    public String platformId;
    public String gameId;
    public String state;
    public Instant startedAt;

    @Column(columnDefinition = "text", updatable = false)
    public String rawJson;

    @Column(columnDefinition = "text", updatable = false)
    public String normalizedJson;

    public Instant createdAt;
    public Long registeredRevision;

    @OneToMany(mappedBy = "match", cascade = CascadeType.ALL)
    public List<MatchParticipantEntity> participants = new ArrayList<>();
}
