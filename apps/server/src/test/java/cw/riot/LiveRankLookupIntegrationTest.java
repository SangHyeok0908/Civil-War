package cw.riot;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import cw.contracts.AccountContracts.AccountLookup;
import cw.contracts.AccountContracts.SoloRankLookup;
import cw.contracts.EvaluationContracts.RankLookup;
import cw.support.DatabaseTestSupport;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

class LiveRankLookupIntegrationTest extends DatabaseTestSupport {
    @MockitoBean RiotGateway gateway;
    @Autowired LiveRankLookup live;
    @Autowired SoloRankService ranks;

    private static final List<String> TEN =
            IntStream.rangeClosed(1, 10).mapToObj(i -> "member-" + i).toList();

    private void verifiedAccounts() {
        when(gateway.resolveAccount(anyString()))
                .thenAnswer(
                        call -> {
                            String riotId = call.getArgument(0);
                            String number = riotId.substring(6, riotId.indexOf('#'));
                            return new AccountLookup("verified", "official-" + number, riotId);
                        });
    }

    private static Map<String, RankLookup> byMember(List<RankLookup> values) {
        return values.stream().collect(Collectors.toMap(RankLookup::memberId, Function.identity()));
    }

    @Test
    void successfulLookupIsLive() {
        verifiedAccounts();
        when(gateway.getSoloRank("official-1"))
                .thenReturn(new SoloRankLookup("ranked", "DIAMOND", "I", 0));
        RankLookup value = byMember(live.lookup(TEN)).get("member-1");
        assertThat(value.source()).isEqualTo("live");
        assertThat(value.status()).isEqualTo("ranked");
        assertThat(value.teamSeed()).isEqualTo(90.0);
        assertThat(value.tier()).isEqualTo("DIAMOND");
    }

    @Test
    void failedLookupUsesSavedValue() {
        verifiedAccounts();
        when(gateway.getSoloRank("official-1"))
                .thenReturn(new SoloRankLookup("ranked", "DIAMOND", "I", 0));
        Instant first = ranks.refresh("member-1").observedAt();
        when(gateway.getSoloRank("official-1"))
                .thenReturn(new SoloRankLookup("unavailable", null, null, 0));
        RankLookup value = byMember(live.lookup(TEN)).get("member-1");
        assertThat(value.source()).isEqualTo("saved");
        assertThat(value.status()).isEqualTo("unavailable");
        assertThat(value.teamSeed()).isEqualTo(90.0);
        assertThat(value.observedAt()).isEqualTo(first);
    }

    @Test
    void neverSucceededUsesDefault() {
        RankLookup value = byMember(live.lookup(TEN)).get("member-1");
        assertThat(value.source()).isEqualTo("default");
        assertThat(value.status()).isEqualTo("unavailable");
        assertThat(value.teamSeed()).isEqualTo(50.0);
        assertThat(value.tier()).isNull();
        assertThat(value.observedAt()).isNull();
    }

    @Test
    void unrankedIsLiveAtFifty() {
        verifiedAccounts();
        when(gateway.getSoloRank("official-1"))
                .thenReturn(new SoloRankLookup("unranked", null, null, 0));
        RankLookup value = byMember(live.lookup(TEN)).get("member-1");
        assertThat(value.source()).isEqualTo("live");
        assertThat(value.teamSeed()).isEqualTo(50.0);
    }

    @Test
    void memberPastDeadlineTimesOutAndIsNotSaved() throws Exception {
        verifiedAccounts();
        when(gateway.getSoloRank(anyString()))
                .thenAnswer(
                        call -> {
                            if ("official-3".equals(call.getArgument(0))) {
                                Thread.sleep(2000);
                            }
                            return new SoloRankLookup("ranked", "GOLD", "IV", 0);
                        });
        LiveRankLookup shortDeadline = new LiveRankLookup(ranks, 300);
        try {
            long started = System.nanoTime();
            List<RankLookup> values = shortDeadline.lookup(TEN);
            assertThat((System.nanoTime() - started) / 1_000_000).isLessThan(1000);
            assertThat(values).extracting(RankLookup::memberId).isEqualTo(TEN);
            RankLookup late = byMember(values).get("member-3");
            assertThat(late.status()).isEqualTo("timeout");
            assertThat(late.source()).isEqualTo("default");
            assertThat(byMember(values).get("member-1").source()).isEqualTo("live");
            Thread.sleep(2500);
            assertThat(ranks.snapshotForMember("member-3").status()).isNotEqualTo("ranked");
        } finally {
            shortDeadline.close();
        }
    }

    @Test
    void blankKeyFinishesWithoutWaitingForTheDeadline() {
        long started = System.nanoTime();
        List<RankLookup> values = live.lookup(TEN);
        assertThat((System.nanoTime() - started) / 1_000_000).isLessThan(2000);
        assertThat(values).hasSize(10).allSatisfy(v -> assertThat(v.source()).isEqualTo("default"));
    }

    @Test
    void exceptionForOneMemberOnlyAffectsThatMember() {
        verifiedAccounts();
        when(gateway.resolveAccount("Player2#test")).thenThrow(new IllegalStateException("boom"));
        when(gateway.getSoloRank("official-1"))
                .thenReturn(new SoloRankLookup("ranked", "DIAMOND", "I", 0));
        Map<String, RankLookup> values = byMember(live.lookup(TEN));
        assertThat(values.get("member-2").status()).isEqualTo("unavailable");
        assertThat(values.get("member-2").source()).isEqualTo("default");
        assertThat(values.get("member-1").source()).isEqualTo("live");
    }

    @Test
    void concurrentLookupsForSameMembersBothSucceed() throws Exception {
        verifiedAccounts();
        when(gateway.getSoloRank(anyString()))
                .thenReturn(new SoloRankLookup("ranked", "GOLD", "I", 0));
        @SuppressWarnings("unchecked")
        List<RankLookup>[] results = new List[2];
        Thread first = Thread.ofVirtual().start(() -> results[0] = live.lookup(TEN));
        Thread second = Thread.ofVirtual().start(() -> results[1] = live.lookup(TEN));
        first.join();
        second.join();
        assertThat(results[0]).hasSize(10);
        assertThat(results[1]).hasSize(10);
        assertThat(results[0]).allSatisfy(v -> assertThat(v.source()).isEqualTo("live"));
        assertThat(results[1]).allSatisfy(v -> assertThat(v.source()).isEqualTo("live"));
    }

    @Autowired javax.sql.DataSource dataSource;

    @Test
    void databaseLockDoesNotTurnFinishedRiotLookupsIntoTimeouts() throws Exception {
        verifiedAccounts();
        when(gateway.getSoloRank(anyString()))
                .thenReturn(new SoloRankLookup("ranked", "GOLD", "IV", 0));
        java.util.concurrent.CountDownLatch locked = new java.util.concurrent.CountDownLatch(1);
        Thread holder =
                Thread.ofVirtual()
                        .start(
                                () -> {
                                    try (java.sql.Connection c = dataSource.getConnection()) {
                                        c.setAutoCommit(false);
                                        c.createStatement()
                                                .execute(
                                                        "select id from service_state where id=1 for update");
                                        locked.countDown();
                                        Thread.sleep(1000);
                                        c.commit();
                                    } catch (Exception error) {
                                        throw new IllegalStateException(error);
                                    }
                                });
        locked.await();
        LiveRankLookup shortDeadline = new LiveRankLookup(ranks, 300);
        try {
            List<RankLookup> values = shortDeadline.lookup(TEN);
            assertThat(values)
                    .allSatisfy(
                            v -> {
                                assertThat(v.source()).isEqualTo("live");
                                assertThat(v.status()).isEqualTo("ranked");
                            });
            assertThat(ranks.snapshotForMember("member-5").tier()).isEqualTo("GOLD");
        } finally {
            shortDeadline.close();
            holder.join();
        }
    }

    @Test
    void riotResultArrivingAfterDeadlineIsNeverSaved() throws Exception {
        verifiedAccounts();
        when(gateway.getSoloRank(anyString()))
                .thenAnswer(
                        call -> {
                            if ("official-4".equals(call.getArgument(0))) {
                                // Ignore cancellation and finish late, as a stuck HTTP call might.
                                long until = System.nanoTime() + 800_000_000L;
                                while (System.nanoTime() < until) {
                                    Thread.onSpinWait();
                                }
                            }
                            return new SoloRankLookup("ranked", "GOLD", "IV", 0);
                        });
        LiveRankLookup shortDeadline = new LiveRankLookup(ranks, 300);
        try {
            RankLookup late = byMember(shortDeadline.lookup(TEN)).get("member-4");
            assertThat(late.status()).isEqualTo("timeout");
            Thread.sleep(1200);
            assertThat(ranks.snapshotForMember("member-4").tier()).isNull();
        } finally {
            shortDeadline.close();
        }
    }
}
