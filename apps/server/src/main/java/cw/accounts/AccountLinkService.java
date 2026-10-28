package cw.accounts;

import cw.contracts.AccountContracts;
import cw.contracts.AccountContracts.IdentityObservation;
import cw.contracts.ApiException;
import cw.db.MutationCoordinator;
import cw.db.ServiceState;
import cw.members.MemberEntity;
import cw.members.MemberRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class AccountLinkService {
    @PersistenceContext private EntityManager em;
    private final PlayerAccountRepository accounts;
    private final MemberRepository members;
    private final MutationCoordinator mutations;
    private final Clock clock;

    public AccountLinkService(
            PlayerAccountRepository accounts,
            MemberRepository members,
            MutationCoordinator mutations,
            Clock clock) {
        this.accounts = accounts;
        this.members = members;
        this.mutations = mutations;
        this.clock = clock;
    }

    public PlayerAccountEntity prepareMember(String riotId) {
        List<PlayerAccountEntity> candidates =
                accounts.findByRiotIdIgnoreCase(riotId).stream()
                        .filter(a -> a.lcuPuuid != null && members.findByAccountId(a.id).isEmpty())
                        .toList();
        if (candidates.size() > 1) {
            throw new ApiException(409, "ACCOUNT_LINK_CONFLICT");
        }
        if (candidates.size() == 1) {
            return candidates.getFirst();
        }
        PlayerAccountEntity account = new PlayerAccountEntity();
        account.id = UUID.randomUUID().toString();
        account.riotId = riotId;
        account.linkStatus = "pending";
        account.updatedAt = clock.instant();
        return accounts.save(account);
    }

    public PlayerAccountEntity accountForPuuid(String puuid) {
        return accounts.findByLcuPuuid(puuid)
                .orElseGet(
                        () -> {
                            PlayerAccountEntity a = new PlayerAccountEntity();
                            a.id = UUID.randomUUID().toString();
                            a.lcuPuuid = puuid;
                            a.linkStatus = "unidentified";
                            a.updatedAt = clock.instant();
                            return accounts.save(a);
                        });
    }

    public PlayerAccountEntity observe(IdentityObservation observation) {
        ServiceState state = mutations.lock();
        validateObservation(observation);
        String riotId = AccountContracts.riotId(observation.riotId());
        List<MemberEntity> named = members.findByRiotIdIgnoreCase(riotId);
        if (named.size() > 1) {
            throw conflict();
        }
        MemberEntity member = named.isEmpty() ? null : named.getFirst();
        PlayerAccountEntity account = accounts.findByLcuPuuid(observation.puuid()).orElse(null);
        MemberEntity owner =
                account == null ? null : members.findByAccountId(account.id).orElse(null);
        if (owner != null && member != null && !owner.id.equals(member.id)) {
            throw conflict();
        }
        if (owner != null) {
            member = owner;
        }
        PlayerAccountEntity previous =
                member == null || member.accountId == null
                        ? null
                        : accounts.findById(member.accountId).orElseThrow();
        if (previous != null
                && previous.lcuPuuid != null
                && !observation.puuid().equals(previous.lcuPuuid)) {
            throw conflict();
        }
        if (account == null) {
            account = previous == null ? accountForPuuid(observation.puuid()) : previous;
        }
        if (previous != null && !previous.id.equals(account.id) && previous.officialPuuid != null) {
            if (account.officialPuuid != null
                    && !account.officialPuuid.equals(previous.officialPuuid)) {
                throw conflict();
            }
            String official = previous.officialPuuid;
            previous.officialPuuid = null;
            accounts.saveAndFlush(previous);
            account.officialPuuid = official;
        }
        account.lcuPuuid = observation.puuid();
        account.riotId = riotId;
        account.linkStatus = account.officialPuuid == null ? "lcu_linked" : "verified";
        account.updatedAt = clock.instant();
        accounts.saveAndFlush(account);
        if (member != null) {
            boolean changed =
                    !account.id.equals(member.accountId)
                            || !observation.puuid().equals(member.puuid);
            member.accountId = account.id;
            member.puuid = observation.puuid();
            if (!riotId.equals(member.riotId)) {
                member.riotId = riotId;
                member.displayName = riotId;
                member.profileRevision++;
            }
            if (changed) {
                em.createNativeQuery(
                                "update match_participants set member_id=:member where player_id=:player")
                        .setParameter("member", member.id)
                        .setParameter("player", account.id)
                        .executeUpdate();
                mutations.changed(state);
                mutations.audit("account_linked", "collector", member.id, "{}");
            }
        }
        em.createNativeQuery(
                        "insert into account_identity_evidence(id,player_id,source,riot_id,observed_at,recorded_at) values(:id,:player,:source,:riot,:observed,:recorded)")
                .setParameter("id", UUID.randomUUID().toString())
                .setParameter("player", account.id)
                .setParameter("source", observation.source())
                .setParameter("riot", riotId)
                .setParameter("observed", observation.observedAt())
                .setParameter("recorded", clock.instant())
                .executeUpdate();
        return account;
    }

    private void validateObservation(IdentityObservation value) {
        if (value == null
                || value.puuid() == null
                || value.puuid().isBlank()
                || value.puuid().length() > 255
                || value.source() == null
                || !Set.of("current_summoner", "current_lookup").contains(value.source())
                || value.observedAt() == null
                || value.observedAt().isBefore(clock.instant().minusSeconds(300))
                || value.observedAt().isAfter(clock.instant().plusSeconds(60))) {
            throw new ApiException(422, "ACCOUNT_EVIDENCE_REQUIRED");
        }
    }

    private ApiException conflict() {
        return new ApiException(409, "ACCOUNT_LINK_CONFLICT");
    }
}
