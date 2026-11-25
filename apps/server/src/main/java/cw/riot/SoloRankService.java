package cw.riot;

import cw.accounts.PlayerAccountEntity;
import cw.accounts.PlayerAccountRepository;
import cw.contracts.AccountContracts.AccountLookup;
import cw.contracts.AccountContracts.RankSeedSnapshot;
import cw.contracts.AccountContracts.SoloRankLookup;
import cw.db.MutationCoordinator;
import cw.domain.RankSeedPolicy;
import cw.members.MemberEntity;
import cw.members.MemberRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class SoloRankService {
    private final SoloRankRepository snapshots;
    private final PlayerAccountRepository accounts;
    private final MemberRepository members;
    private final RiotGateway gateway;
    private final MutationCoordinator mutations;
    private final Clock clock;
    private final TransactionTemplate tx;

    public SoloRankService(
            SoloRankRepository snapshots,
            PlayerAccountRepository accounts,
            MemberRepository members,
            RiotGateway gateway,
            MutationCoordinator mutations,
            Clock clock,
            PlatformTransactionManager manager) {
        this.snapshots = snapshots;
        this.accounts = accounts;
        this.members = members;
        this.gateway = gateway;
        this.mutations = mutations;
        this.clock = clock;
        this.tx = new TransactionTemplate(manager);
    }

    public RankSeedSnapshot snapshot(String playerId) {
        if (playerId == null) {
            return empty();
        }
        return snapshots.findById(playerId).map(this::view).orElseGet(this::empty);
    }

    private RankSeedSnapshot empty() {
        return new RankSeedSnapshot(RankSeedPolicy.neutral(), "unavailable", null, null, null);
    }

    private RankSeedSnapshot view(SoloRankSnapshot value) {
        return new RankSeedSnapshot(
                value.seedValue, value.status, value.tier, value.division, value.observedAt);
    }

    public RankSeedSnapshot snapshotForMember(String memberId) {
        return members.findById(memberId).map(m -> snapshot(m.accountId)).orElseGet(this::empty);
    }

    public RankSeedSnapshot refresh(String memberId) {
        return refresh(memberId, Instant.MAX);
    }

    private boolean expired(Instant deadline) {
        return Thread.currentThread().isInterrupted() || clock.instant().isAfter(deadline);
    }

    /** Returns null without saving when the deadline passed before the result could be stored. */
    public RankSeedSnapshot refresh(String memberId, Instant deadline) {
        MemberEntity member = members.findById(memberId).orElseThrow();
        String playerId = member.accountId, riotId = member.riotId;
        AccountLookup official = gateway.resolveAccount(riotId);
        SoloRankLookup result =
                official != null && "verified".equals(official.status())
                        ? gateway.getSoloRank(official.puuid())
                        : new SoloRankLookup(
                                official != null && "not_found".equals(official.status())
                                        ? "not_found"
                                        : "unavailable",
                                null,
                                null,
                                official == null ? 0 : official.retryAfterMillis());
        if (result == null) {
            result = new SoloRankLookup("unavailable", null, null, 0);
        }
        SoloRankLookup lookup = result;
        if (expired(deadline)) {
            return null;
        }
        return tx.execute(
                transaction -> {
                    mutations.lock();
                    if (expired(deadline)) {
                        return null;
                    }
                    MemberEntity current = members.findById(memberId).orElseThrow();
                    if (!riotId.equals(current.riotId)
                            || !Objects.equals(playerId, current.accountId)) {
                        return snapshot(current.accountId);
                    }
                    PlayerAccountEntity account = accounts.findById(playerId).orElseThrow();
                    SoloRankSnapshot saved =
                            snapshots
                                    .findById(playerId)
                                    .orElseGet(
                                            () -> {
                                                SoloRankSnapshot value = new SoloRankSnapshot();
                                                value.playerId = playerId;
                                                value.seedValue = RankSeedPolicy.neutral();
                                                return value;
                                            });
                    double before = saved.seedValue;
                    // PostgreSQL keeps microseconds; Linux clocks return nanoseconds. Truncate
                    // so the returned snapshot equals what a later read returns.
                    Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
                    saved.attemptedAt = now;
                    saved.status = lookup.status();
                    if (official != null && "verified".equals(official.status())) {
                        if (account.officialPuuid != null
                                && !account.officialPuuid.equals(official.puuid())) {
                            saved.status = "conflict";
                        } else {
                            account.officialPuuid = official.puuid();
                            account.linkStatus =
                                    account.lcuPuuid == null ? "official_linked" : "verified";
                            accounts.save(account);
                        }
                    }
                    if ("ranked".equals(saved.status) || "unranked".equals(saved.status)) {
                        saved.seedValue =
                                "ranked".equals(saved.status)
                                        ? RankSeedPolicy.toSeed(lookup.tier(), lookup.division())
                                        : RankSeedPolicy.neutral();
                        saved.tier = lookup.tier();
                        saved.division = lookup.division();
                        saved.observedAt = now;
                        saved.nextAttemptAt = now.plusSeconds(RankSeedPolicy.successCacheSeconds());
                    } else {
                        saved.nextAttemptAt =
                                now.plusMillis(
                                        Math.max(
                                                RankSeedPolicy.failureBackoffMillis(),
                                                lookup.retryAfterMillis()));
                    }
                    snapshots.save(saved);
                    // Team recommendations read the seed live, so a change needs no recalculation.
                    if (Double.compare(before, saved.seedValue) != 0) {
                        mutations.audit("rank_seed_updated", "server", memberId, "{}");
                    }
                    return view(saved);
                });
    }

    public void refreshNextDue() {
        for (MemberEntity member : members.findAll()) {
            if (member.accountId == null) {
                continue;
            }
            SoloRankSnapshot snapshot = snapshots.findById(member.accountId).orElse(null);
            if (snapshot == null
                    || snapshot.nextAttemptAt == null
                    || !snapshot.nextAttemptAt.isAfter(clock.instant())) {
                refresh(member.id);
                return;
            }
        }
    }
}
