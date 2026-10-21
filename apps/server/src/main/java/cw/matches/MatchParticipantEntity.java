package cw.matches;
import jakarta.persistence.*;
import cw.contracts.Role;
@Entity @Table(name="match_participants")
public class MatchParticipantEntity {
    @Id public String id;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="match_id") public MatchEntity match;
    public String memberId;
    public String puuid;
    public int teamId;
    public int championId;
    public boolean win;
    @Enumerated(EnumType.STRING) public Role role;
}
