package cw.teams;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import cw.contracts.AccountContracts.AccountLookup;
import cw.contracts.AccountContracts.SoloRankLookup;
import cw.contracts.EvaluationContracts.EvaluationGeneration;
import cw.contracts.EvaluationContracts.RoleReferenceSample;
import cw.contracts.EvaluationContracts.RoleSkill;
import cw.contracts.EvaluationContracts.TeamRecommendation;
import cw.contracts.Role;
import cw.domain.RoleSuggester.Suggestion;
import cw.evaluation.EvaluationRepository;
import cw.evaluation.EvaluationSnapshot;
import cw.evaluation.RecalculationWorker;
import cw.members.MemberReferenceImporter;
import cw.members.MemberService;
import cw.riot.RiotGateway;
import cw.riot.SoloRankService;
import cw.support.DatabaseTestSupport;
import java.time.Instant;
import java.util.List;
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
    @Autowired EvaluationSnapshot snapshot;
    @Autowired MemberService memberService;
    @Autowired MemberReferenceImporter importer;
    @Autowired TeamService teams;
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

    @Test
    void noInhouseHistoryUsesSoloRankForTeamRecommendation() throws Exception {
        rankedSeed();
        assertThat(worker.runOnce()).isTrue();
        EvaluationGeneration generation = evaluations.current();
        assertThat(generation.gameScores()).isEmpty();
        assertThat(generation.roleSkills().stream().filter(s -> s.memberId().equals("member-1")))
                .hasSize(5)
                .allSatisfy(
                        skill -> {
                            assertThat(skill.n()).isZero();
                            assertThat(skill.value()).isEqualTo(90.0);
                        });
        mvc.perform(post("/api/teams/recommend").contentType("application/json").content(body()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.candidates.length()").value(3));
    }

    @Test
    void oneInhouseGameBlendsSoloRankAndThatRoleScore() throws Exception {
        rankedSeed();
        registered();
        assertThat(worker.runOnce()).isTrue();
        EvaluationGeneration generation = evaluations.current();
        double score =
                generation.gameScores().stream()
                        .filter(s -> s.memberId().equals("member-1"))
                        .findFirst()
                        .orElseThrow()
                        .score();
        RoleSkill top =
                generation.roleSkills().stream()
                        .filter(s -> s.memberId().equals("member-1") && s.role() == Role.TOP)
                        .findFirst()
                        .orElseThrow();
        assertThat(top.n()).isEqualTo(1);
        assertThat(top.value()).isCloseTo((450.0 + score) / 6.0, within(1e-10));
        assertThat(
                        generation.roleSkills().stream()
                                .filter(
                                        s ->
                                                s.memberId().equals("member-1")
                                                        && s.role() != Role.TOP))
                .allSatisfy(
                        skill -> {
                            assertThat(skill.n()).isZero();
                            assertThat(skill.value()).isEqualTo(90.0);
                        });
        mvc.perform(post("/api/teams/recommend").contentType("application/json").content(body()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.candidates.length()").value(3));
    }

    @Test
    void importedSoloPositionSampleDoesNotSupplyTeamRecommendationSkill() throws Exception {
        assertThat(worker.runOnce()).isTrue();
        List<String> ids = IntStream.rangeClosed(1, 10).mapToObj(i -> "member-" + i).toList();
        TeamRecommendation before = teams.recommend(ids);
        List<RoleSkill> beforeSkills = worker.calculate(snapshot.capture()).roleSkills();
        Suggestion suggestion =
                importer.importReferences(
                        new MemberReferenceImporter.ImportInput(
                                "member-1",
                                "official-1",
                                true,
                                List.of(
                                        new RoleReferenceSample(
                                                "fixture-player-01",
                                                "solo420",
                                                "KR_solo_team_check",
                                                Instant.parse("2026-01-01T00:00:00Z"),
                                                Role.JUNGLE,
                                                json.readTree(
                                                        "{\"officialPuuid\":\"official-1\",\"queueId\":420,\"teamPosition\":\"JUNGLE\",\"durationSeconds\":1800,\"earlyEnded\":false}")))));
        assertThat(suggestion.primary()).isEqualTo(Role.JUNGLE);
        assertThat(suggestion.sampleCount()).isEqualTo(1);
        // Recompute from the database as well as checking the cached recommendation.
        assertThat(worker.calculate(snapshot.capture()).roleSkills()).isEqualTo(beforeSkills);
        assertThat(teams.recommend(ids)).isEqualTo(before);
        assertThat(memberService.get("member-1").seedSkill()).isEqualTo(50);
        mvc.perform(post("/api/teams/recommend").contentType("application/json").content(body()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.candidates.length()").value(3));
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
