package cw.contracts;

import java.time.Instant;
import java.util.List;

/**
 * Internal/member-owner and public contracts stay separate to prevent accidental identity leakage.
 */
public final class MemberContracts {
    private MemberContracts() {}

    public record Member(
            String id,
            String puuid,
            String riotId,
            String displayName,
            boolean active,
            Role primaryRole,
            Role secondaryRole,
            List<Role> allowedRoles,
            int seedSkill,
            long profileRevision,
            Double teamSeed,
            String rankStatus,
            String rankTier,
            String rankDivision,
            Instant rankObservedAt,
            Integer profileIconId) {
        public Member(
                String id,
                String puuid,
                String riotId,
                String displayName,
                boolean active,
                Role primaryRole,
                Role secondaryRole,
                List<Role> allowedRoles,
                int seedSkill,
                long profileRevision) {
            this(
                    id,
                    puuid,
                    riotId,
                    displayName,
                    active,
                    primaryRole,
                    secondaryRole,
                    allowedRoles,
                    seedSkill,
                    profileRevision,
                    null,
                    "unavailable",
                    null,
                    null,
                    null,
                    null);
        }
    }

    public record PublicMember(
            String id,
            String displayName,
            boolean active,
            Role primaryRole,
            Role secondaryRole,
            List<Role> allowedRoles,
            Integer profileIconId) {}
}
