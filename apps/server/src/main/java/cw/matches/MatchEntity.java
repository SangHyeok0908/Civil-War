package cw.matches;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.*;

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
