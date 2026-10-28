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
import org.springframework.test.context.bean.override.mockito.MockitoBean;

class SoloRankIntegrationTest extends DatabaseTestSupport {
    @MockitoBean RiotGateway gateway;
    @Autowired SoloRankService ranks;

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
        var first = ranks.refresh("member-1");
        assertThat(first.teamSeed()).isEqualTo(90.);
        long before = revision();
        when(gateway.getSoloRank("official"))
                .thenReturn(new SoloRankLookup("unavailable", null, null, 12000));
        var failed = ranks.refresh("member-1");
        assertThat(failed.status()).isEqualTo("unavailable");
        assertThat(failed.teamSeed()).isEqualTo(90.);
        assertThat(failed.observedAt()).isEqualTo(first.observedAt());
        assertThat(revision()).isEqualTo(before);
    }
}
