package cw.teams;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import cw.contracts.AccountContracts.AccountLookup;
import cw.contracts.AccountContracts.SoloRankLookup;
import cw.evaluation.EvaluationRepository;
import cw.evaluation.RecalculationWorker;
import cw.riot.RiotGateway;
import cw.riot.SoloRankService;
import cw.support.DatabaseTestSupport;
import java.util.Map;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@AutoConfigureMockMvc
class TeamApiIntegrationTest extends DatabaseTestSupport {
    @Autowired MockMvc mvc;
    @Autowired RecalculationWorker worker;
    @Autowired EvaluationRepository evaluations;
    @Autowired SoloRankService ranks;
    @MockitoBean RiotGateway gateway;

    private void rankedSeed() {
        when(gateway.resolveAccount("Player1#test"))
                .thenReturn(new AccountLookup("verified", "official-1", "Player1#test"));
        when(gateway.getSoloRank("official-1"))
                .thenReturn(new SoloRankLookup("ranked", "DIAMOND", "I", 0));
        assertThat(ranks.refresh("member-1").teamSeed()).isEqualTo(90.0);
    }

    String body() {
        return json.writeValueAsString(
                Map.of(
                        "memberIds",
                        IntStream.rangeClosed(1, 10).mapToObj(i -> "member-" + i).toList()));
    }

    @Test
    void anonymousAllowed() throws Exception {
        mvc.perform(post("/api/teams/recommend").contentType("application/json").content(body()))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.code").value("RECALCULATING"));
        worker.runOnce();
        mvc.perform(post("/api/teams/recommend").contentType("application/json").content(body()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.candidates.length()").value(3));
    }

    private String member1Seed() {
        return "$.rankLookups[?(@.memberId=='member-1')].teamSeed";
    }

    @Test
    void noInhouseHistoryUsesSoloRankForTeamRecommendation() throws Exception {
        rankedSeed();
        assertThat(worker.runOnce()).isTrue();
        assertThat(evaluations.current().gameScores()).isEmpty();
        mvc.perform(post("/api/teams/recommend").contentType("application/json").content(body()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.candidates.length()").value(3))
                .andExpect(jsonPath(member1Seed()).value(90.0));
    }

    @Test
    void oneInhouseGameBlendsSoloRankAndThatRoleScore() throws Exception {
        rankedSeed();
        registered();
        assertThat(worker.runOnce()).isTrue();
        mvc.perform(post("/api/teams/recommend").contentType("application/json").content(body()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.candidates.length()").value(3))
                .andExpect(jsonPath(member1Seed()).value(90.0));
    }

    @Test
    void recommendationReturnsRankLookupsForAllTen() throws Exception {
        rankedSeed();
        assertThat(worker.runOnce()).isTrue();
        mvc.perform(post("/api/teams/recommend").contentType("application/json").content(body()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rankLookups.length()").value(10))
                .andExpect(
                        jsonPath("$.rankLookups[?(@.memberId=='member-1')].source").value("live"))
                .andExpect(jsonPath(member1Seed()).value(90.0));
    }

    @Test
    void freshRankChangesRecommendationWithoutRecalculation() throws Exception {
        rankedSeed();
        assertThat(worker.runOnce()).isTrue();
        mvc.perform(post("/api/teams/recommend").contentType("application/json").content(body()))
                .andExpect(jsonPath(member1Seed()).value(90.0));
        long revisionBefore = revision(), jobsBefore = jobs();
        when(gateway.getSoloRank("official-1"))
                .thenReturn(new SoloRankLookup("ranked", "IRON", "IV", 0));
        mvc.perform(post("/api/teams/recommend").contentType("application/json").content(body()))
                .andExpect(status().isOk())
                .andExpect(jsonPath(member1Seed()).value(0.0));
        assertThat(revision()).isEqualTo(revisionBefore);
        assertThat(jobs()).isEqualTo(jobsBefore);
    }

    @Test
    void recalculatingSkipsRiotLookups() throws Exception {
        mvc.perform(post("/api/teams/recommend").contentType("application/json").content(body()))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.code").value("RECALCULATING"));
        verify(gateway, never()).resolveAccount(any());
    }

    @Test
    void publicRateLimiting() throws Exception {
        for (int i = 0; i < 60; i++) {
            mvc.perform(
                            post("/api/teams/recommend")
                                    .with(
                                            r -> {
                                                r.setRemoteAddr("192.0.2.7");
                                                return r;
                                            })
                                    .contentType("application/json")
                                    .content(body()))
                    .andExpect(status().isAccepted());
        }

        mvc.perform(
                        post("/api/teams/recommend")
                                .with(
                                        r -> {
                                            r.setRemoteAddr("192.0.2.7");
                                            return r;
                                        })
                                .contentType("application/json")
                                .content(body()))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "600"));
    }
}
