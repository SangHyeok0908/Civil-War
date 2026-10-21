package cw.members;
import jakarta.persistence.*;
import cw.contracts.Role;
@Entity @Table(name="members")
public class MemberEntity {
    @Id public String id;
    @Column(updatable=false) public String puuid;
    public String riotId;
    public String displayName;
    public boolean active;
    @Enumerated(EnumType.STRING) public Role primaryRole;
    @Enumerated(EnumType.STRING) public Role secondaryRole;
    public String allowedRoles;
    public int seedSkill;
    public long profileRevision;
}
