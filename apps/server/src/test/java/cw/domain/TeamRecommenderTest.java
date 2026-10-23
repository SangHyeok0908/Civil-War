package cw.domain;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.*;
import cw.contracts.EvaluationContracts.*;
import cw.contracts.MemberContracts.Member;
import java.util.*;
import org.junit.jupiter.api.Test;

class TeamRecommenderTest {
    List<Member> players() {
        return ScoringServiceTest.members().subList(0, 10);
    }

    @Test
    void allowedRolesOnlyAndAtMostThreeDistinctRosters() {
        var ps =
                players().stream()
                        .map(
                                m ->
                                        new Member(
                                                m.id(),
                                                m.puuid(),
                                                m.riotId(),
                                                m.displayName(),
                                                true,
                                                m.primaryRole(),
                                                null,
                                                List.of(m.primaryRole()),
                                                50,
                                                1))
                        .toList();
        var result =
                new TeamRecommender()
                        .recommend(ps, new RoleSkillCalculator().calculate(ps, List.of()), 1, 5);
        assertThat(result.candidates()).hasSize(3);
        Set<String> rosters = new HashSet<>();
        for (var c : result.candidates()) {
            assertThat(c.teamA()).hasSize(5);
            assertThat(c.teamB()).hasSize(5);
            rosters.add(c.teamA().stream().map(TeamSeat::memberId).sorted().toList().toString());
            for (var s : c.teamA()) {
                assertThat(
                                ps.stream()
                                        .filter(p -> p.id().equals(s.memberId()))
                                        .findFirst()
                                        .orElseThrow()
                                        .allowedRoles())
                        .contains(s.role());
            }
        }
        assertThat(rosters).hasSize(3);
    }

    @Test
    void impossibleMatching() {
        var ps =
                players().stream()
                        .map(
                                m ->
                                        new Member(
                                                m.id(),
                                                m.puuid(),
                                                m.riotId(),
                                                m.displayName(),
                                                true,
                                                null,
                                                null,
                                                List.of(Role.TOP, Role.JUNGLE),
                                                50,
                                                1))
                        .toList();
        var result =
                new TeamRecommender()
                        .recommend(ps, new RoleSkillCalculator().calculate(ps, List.of()), 1, 5);
        assertThat(result.candidates()).isEmpty();
        assertThat(result.reason()).contains("MIDDLE");
    }

    @Test
    void duplicatesAndInactiveRejected() {
        var ps = new ArrayList<>(players());
        ps.set(9, ps.get(0));
        final var duplicate = ps;
        assertThatThrownBy(() -> new TeamRecommender().recommend(duplicate, List.of(), 1, 5))
                .isInstanceOf(ApiException.class);
        ps = new ArrayList<>(players());
        var m = ps.get(9);
        ps.set(
                9,
                new Member(
                        m.id(),
                        m.puuid(),
                        m.riotId(),
                        m.displayName(),
                        false,
                        m.primaryRole(),
                        null,
                        m.allowedRoles(),
                        50,
                        1));
        final var inactive = ps;
        assertThatThrownBy(() -> new TeamRecommender().recommend(inactive, List.of(), 1, 5))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void allTenAllFiveRolesBenchmark126Partitions() {
        var ps = players();
        var skills = new RoleSkillCalculator().calculate(ps, List.of());
        long start = System.nanoTime();
        var recommender = new TeamRecommender();
        var result = recommender.recommend(ps, skills, 1, 5);
        long ms = (System.nanoTime() - start) / 1_000_000;
        System.out.println(
                "TEAM_BENCHMARK all10/all5roles partitions="
                        + TeamRecommender.partitions().size()
                        + " elapsedMs="
                        + ms);
        assertThat(TeamRecommender.partitions()).hasSize(126);
        assertThat(result.candidates()).hasSize(3);
        assertThat(ms).isLessThan(2000);
        assertThat(result)
                .isEqualTo(recommender.recommend(new ArrayList<>(ps.reversed()), skills, 1, 5));
    }

    @Test
    void balanceBeforePreference() {
        var ps = players();
        var skills = new ArrayList<>(new RoleSkillCalculator().calculate(ps, List.of()));
        skills.replaceAll(
                s ->
                        s.memberId().equals("m0") && s.role() == Role.TOP
                                ? new RoleSkill(s.memberId(), s.role(), 100, 0)
                                : s);
        var result = new TeamRecommender().recommend(ps, skills, 1, 5);
        assertThat(result.candidates().getFirst().skillDifference()).isZero();
        assertThat(
                        result.candidates().getFirst().teamA().stream()
                                .filter(s -> s.memberId().equals("m0"))
                                .findFirst()
                                .orElseThrow()
                                .role())
                .isNotEqualTo(Role.TOP);
    }

    @Test
    void oneOrTwoOnly() {
        for (int first : List.of(3, 1)) {
            int[] seeds = {first, 7, 19, 50, 100, 0, 0, 0, 0, 0};
            List<Member> ps = new ArrayList<>();
            for (int i = 0; i < 10; i++) {
                var m = players().get(i);
                ps.add(
                        new Member(
                                m.id(),
                                m.puuid(),
                                m.riotId(),
                                m.displayName(),
                                true,
                                m.primaryRole(),
                                null,
                                List.of(m.primaryRole()),
                                seeds[i],
                                1));
            }
            var result =
                    new TeamRecommender()
                            .recommend(
                                    ps, new RoleSkillCalculator().calculate(ps, List.of()), 1, 5);
            assertThat(result.candidates()).hasSize(first == 3 ? 1 : 2);
        }
    }

    @Test
    void roleSkillPrior() {
        var m = players().get(0);
        var skills =
                new RoleSkillCalculator()
                        .calculate(
                                List.of(m),
                                List.of(
                                        new GameScore(
                                                "x", m.id(), Role.TOP, "v", 80, 1, Map.of())));
        assertThat(
                        skills.stream()
                                .filter(s -> s.role() == Role.TOP)
                                .findFirst()
                                .orElseThrow()
                                .value())
                .isEqualTo(55.);
        assertThat(
                        skills.stream()
                                .filter(s -> s.role() == Role.JUNGLE)
                                .findFirst()
                                .orElseThrow()
                                .value())
                .isEqualTo(50.);
    }
}
