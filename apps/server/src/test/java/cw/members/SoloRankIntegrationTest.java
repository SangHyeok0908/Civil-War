package cw.members;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;

import cw.contracts.AccountContracts.AccountLookup;
import cw.contracts.AccountContracts.SoloRankLookup;
import cw.riot.RiotGateway;
import cw.riot.SoloRankService;
import cw.support.DatabaseTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

class SoloRankIntegrationTest extends DatabaseTestSupport {
    /**
     * Linux clocks return nanoseconds while PostgreSQL stores microseconds; macOS clocks hide this.
     * Adding one nanosecond reproduces the Linux case on every host.
     */
    @TestConfiguration
    static class NanosecondClock {
        @Bean
        @Primary
        java.time.Clock nanosecondClock() {
            return java.time.Clock.offset(
                    java.time.Clock.systemUTC(), java.time.Duration.ofNanos(1));
        }
    }

    @MockitoBean RiotGateway gateway;
    @Autowired SoloRankService ranks;
    @Autowired MemberService profiles;
    @Autowired cw.accounts.AccountLinkService links;

    @Test
    void accountRateLimitDelaysTheMembersNextAttempt() {
        when(gateway.resolveAccount("Player1#test"))
                .thenReturn(new AccountLookup("unavailable", null, "Player1#test", 600000));
        ranks.refresh("member-1");
        java.sql.Timestamp next =
                jdbc.queryForObject(
                        "select next_attempt_at from solo_rank_snapshots where player_id='member-1'",
                        java.sql.Timestamp.class);
        assertThat(next.toInstant()).isAfter(java.time.Instant.now().plusSeconds(599));
    }

    @Test
    void accountMergeRetainsKnownRankWhenNextLookupFails() {
        members.deleteById("member-7");
        cw.contracts.MemberContracts.Member pending =
                profiles.create(json.readTree("{\"riotId\":\"Future#test\"}"));
        when(gateway.resolveAccount("Future#test"))
                .thenReturn(new AccountLookup("verified", "official-future", "Future#test"));
        when(gateway.getSoloRank("official-future"))
                .thenReturn(new SoloRankLookup("ranked", "DIAMOND", "I", 0));
        java.time.Instant observed = ranks.refresh(pending.id()).observedAt();
        links.observe(
                new cw.contracts.AccountContracts.IdentityObservation(
                        "fixture-player-07",
                        "Future#test",
                        "current_lookup",
                        java.time.Instant.now()));
        assertThat(profiles.get(pending.id()).teamSeed()).isEqualTo(90.);
        when(gateway.getSoloRank("official-future"))
                .thenReturn(new SoloRankLookup("unavailable", null, null, 0));
        assertThat(ranks.refresh(pending.id()).teamSeed()).isEqualTo(90.);
        assertThat(profiles.get(pending.id()).rankObservedAt()).isEqualTo(observed);
    }

    @Test
    void unrankedStartsAtMidpoint() {
        when(gateway.resolveAccount("Player1#test"))
                .thenReturn(new AccountLookup("verified", "official", "Player1#test"));
        when(gateway.getSoloRank("official"))
                .thenReturn(new SoloRankLookup("unranked", null, null, 0));
        assertThat(ranks.refresh("member-1").teamSeed()).isEqualTo(50.);
        assertThat(ranks.snapshot("member-1").status()).isEqualTo("unranked");
    }

    @Test
    void failedRefreshKeepsLastSuccess() {
        when(gateway.resolveAccount("Player1#test"))
                .thenReturn(new AccountLookup("verified", "official", "Player1#test"));
        when(gateway.getSoloRank("official"))
                .thenReturn(new SoloRankLookup("ranked", "DIAMOND", "I", 0));
        cw.contracts.AccountContracts.RankSeedSnapshot first = ranks.refresh("member-1");
        assertThat(first.teamSeed()).isEqualTo(90.);
        long before = revision();
        when(gateway.getSoloRank("official"))
                .thenReturn(new SoloRankLookup("unavailable", null, null, 12000));
        cw.contracts.AccountContracts.RankSeedSnapshot failed = ranks.refresh("member-1");
        assertThat(failed.status()).isEqualTo("unavailable");
        assertThat(failed.teamSeed()).isEqualTo(90.);
        assertThat(failed.observedAt()).isEqualTo(first.observedAt());
        assertThat(revision()).isEqualTo(before);
    }
}
