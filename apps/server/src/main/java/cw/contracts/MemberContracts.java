package cw.contracts;
import java.util.List;
/** Internal/member-owner and public contracts stay separate to prevent accidental identity leakage. */
public final class MemberContracts {
    private MemberContracts() {}
    public record Member(String id,String puuid,String riotId,String displayName,boolean active,
        Role primaryRole,Role secondaryRole,List<Role> allowedRoles,int seedSkill,long profileRevision) {}
    public record PublicMember(String id,String displayName,boolean active,Role primaryRole,Role secondaryRole,List<Role> allowedRoles) {}
}
