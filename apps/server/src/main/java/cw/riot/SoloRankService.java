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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

    /** The member as read before a lookup; a save is skipped if it changed meanwhile. */
    public record Target(String memberId, String riotId, String playerId, String storedPuuid) {}

    /**
     * A finished Riot lookup that has not been saved yet. {@code storedPuuidForeign} means Riot
     * could not decrypt the stored PUUID, so it came from a previous API key.
     */
    public record Fetched(
            Target target,
            AccountLookup official,
            SoloRankLookup lookup,
            boolean storedPuuidForeign) {}

    public Target target(String memberId) {
        MemberEntity member = members.findById(memberId).orElseThrow();
        String stored =
                member.accountId == null
                        ? null
                        : accounts.findById(member.accountId)
                                .map(account -> account.officialPuuid)
                                .orElse(null);
        return new Target(memberId, member.riotId, member.accountId, stored);
    }

    /** Calls Riot only, so a cancelled caller never interrupts database work. */
    public Fetched fetch(Target target) {
        AccountLookup official = gateway.resolveAccount(target.riotId());
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
        // PUUIDs are encrypted per API key, so a key change makes every stored one differ.
        boolean foreign =
                official != null
                        && "verified".equals(official.status())
                        && target.storedPuuid() != null
                        && !target.storedPuuid().equals(official.puuid())
                        && "foreign_key".equals(gateway.puuidState(target.storedPuuid()));
        return new Fetched(target, official, result, foreign);
    }

    public RankSeedSnapshot refresh(String memberId) {
        return save(List.of(fetch(target(memberId)))).get(memberId);
    }

    /** Saves finished lookups under one lock and returns each member's stored view. */
    public Map<String, RankSeedSnapshot> save(List<Fetched> values) {
        return tx.execute(
                transaction -> {
                    mutations.lock();
                    Map<String, RankSeedSnapshot> saved = new LinkedHashMap<>();
                    for (Fetched value : values) {
                        saved.put(value.target().memberId(), saveOne(value));
                    }
                    return saved;
                });
    }

    private RankSeedSnapshot saveOne(Fetched fetched) {
        String memberId = fetched.target().memberId(),
                riotId = fetched.target().riotId(),
                playerId = fetched.target().playerId();
        AccountLookup official = fetched.official();
        SoloRankLookup lookup = fetched.lookup();
        MemberEntity current = members.findById(memberId).orElseThrow();
        if (!riotId.equals(current.riotId) || !Objects.equals(playerId, current.accountId)) {
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
            boolean differs =
                    account.officialPuuid != null
                            && !account.officialPuuid.equals(official.puuid());
            // Replace only the exact value Riot refused, and never take one another account holds.
            boolean replace =
                    differs
                            && fetched.storedPuuidForeign()
                            && account.officialPuuid.equals(fetched.target().storedPuuid())
                            && accounts.findByOfficialPuuid(official.puuid()).isEmpty();
            if (differs && !replace) {
                saved.status = "conflict";
            } else {
                if (replace) {
                    mutations.audit("official_puuid_replaced", "server", memberId, "{}");
                }
                account.officialPuuid = official.puuid();
                account.linkStatus = account.lcuPuuid == null ? "official_linked" : "verified";
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
        }
        snapshots.save(saved);
        // Team recommendations read the seed live, so a change needs no recalculation.
        if (Double.compare(before, saved.seedValue) != 0) {
            mutations.audit("rank_seed_updated", "server", memberId, "{}");
        }
        return view(saved);
    }
}
