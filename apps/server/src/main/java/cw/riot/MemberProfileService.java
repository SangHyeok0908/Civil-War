package cw.riot;

import cw.contracts.AccountContracts.AccountLookup;
import cw.contracts.AccountContracts.ProfileIconLookup;
import cw.db.MutationCoordinator;
import cw.members.MemberEntity;
import cw.members.MemberRepository;
import java.time.Clock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class MemberProfileService {
    private static final long SUCCESS_CACHE_SECONDS = 86400;
    private static final long FAILURE_BACKOFF_MILLIS = 60000;
    private final MemberProfileRepository snapshots;
    private final MemberRepository members;
    private final RiotGateway gateway;
    private final MutationCoordinator mutations;
    private final Clock clock;
    private final TransactionTemplate tx;

    public MemberProfileService(
            MemberProfileRepository snapshots,
            MemberRepository members,
            RiotGateway gateway,
            MutationCoordinator mutations,
            Clock clock,
            PlatformTransactionManager manager) {
        this.snapshots = snapshots;
        this.members = members;
        this.gateway = gateway;
        this.mutations = mutations;
        this.clock = clock;
        this.tx = new TransactionTemplate(manager);
    }

    public Integer icon(String memberId, String riotId) {
        return snapshots
                .findById(memberId)
                .filter(value -> value.riotId.equalsIgnoreCase(riotId))
                .map(value -> value.profileIconId)
                .orElse(null);
    }

    public void refresh(String memberId) {
        MemberEntity member = members.findById(memberId).orElse(null);
        if (member == null) {
            return;
        }
        String riotId = member.riotId;
        AccountLookup account = gateway.resolveAccount(riotId);
        ProfileIconLookup lookup =
                account != null && "verified".equals(account.status())
                        ? gateway.getProfileIcon(account.puuid())
                        : null;
        long retry =
                lookup != null
                        ? lookup.retryAfterMillis()
                        : account != null ? account.retryAfterMillis() : 0;
        tx.executeWithoutResult(
                transaction -> {
                    // Lock only the write; the network call never holds the shared mutation lock.
                    mutations.lock();
                    MemberEntity current = members.findById(memberId).orElse(null);
                    if (current == null || !riotId.equals(current.riotId)) {
                        return;
                    }
                    MemberProfileSnapshot saved =
                            snapshots
                                    .findById(memberId)
                                    .orElseGet(
                                            () -> {
                                                MemberProfileSnapshot value =
                                                        new MemberProfileSnapshot();
                                                value.memberId = memberId;
                                                return value;
                                            });
                    if (saved.riotId == null || !saved.riotId.equalsIgnoreCase(riotId)) {
                        saved.profileIconId = null;
                        saved.observedAt = null;
                    }
                    saved.riotId = riotId;
                    boolean available =
                            lookup != null
                                    && "available".equals(lookup.status())
                                    && lookup.profileIconId() != null
                                    && lookup.profileIconId() >= 0;
                    if (available) {
                        saved.profileIconId = lookup.profileIconId();
                        saved.observedAt = clock.instant();
                    }
                    saved.nextAttemptAt =
                            available
                                    ? clock.instant().plusSeconds(SUCCESS_CACHE_SECONDS)
                                    : clock.instant()
                                            .plusMillis(Math.max(FAILURE_BACKOFF_MILLIS, retry));
                    snapshots.save(saved);
                });
    }

    public void refreshNextDue() {
        for (MemberEntity member : members.findAll()) {
            MemberProfileSnapshot saved = snapshots.findById(member.id).orElse(null);
            if (saved == null
                    || !saved.riotId.equalsIgnoreCase(member.riotId)
                    || !saved.nextAttemptAt.isAfter(clock.instant())) {
                refresh(member.id);
                return;
            }
        }
    }
}
