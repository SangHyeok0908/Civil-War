package cw.domain;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.EvaluationContracts.GameScore;
import cw.contracts.EvaluationContracts.RoleSkill;
import cw.contracts.MemberContracts.Member;
import cw.contracts.Role;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class RoleSkillCalculatorTest {
    private Member legacy() {
        return new Member(
                "m", "p", "Name#KR1", "Name", true, Role.TOP, null, List.of(Role.TOP), 99, 1);
    }

    @Test
    void manualLegacySeedDoesNotAffectNewCalculation() {
        assertThat(
                        new RoleSkillCalculator()
                                .calculate(List.of(legacy()), List.of(), Map.of())
                                .getFirst()
                                .value())
                .isEqualTo(50.);
    }

    @Test
    void fiveGamePriorMixesWithHistory() {
        GameScore score = new GameScore("game", "m", Role.TOP, "version", 80., 1, Map.of());
        assertThat(
                        new RoleSkillCalculator()
                                .calculate(List.of(legacy()), List.of(score), Map.of()).stream()
                                        .filter(s -> s.role() == Role.TOP)
                                        .findFirst()
                                        .orElseThrow()
                                        .value())
                .isEqualTo(55.);
    }

    @Test
    void seedActsAsFiveVirtualGames() {
        List<GameScore> scores =
                IntStream.range(0, 5)
                        .mapToObj(
                                i ->
                                        new GameScore(
                                                "g" + i, "m", Role.TOP, "version", 60., 1,
                                                Map.of()))
                        .toList();
        List<RoleSkill> skills =
                new RoleSkillCalculator().calculate(List.of(legacy()), scores, Map.of("m", 90.));
        assertThat(skills)
                .allSatisfy(s -> assertThat(s.value()).isEqualTo(s.role() == Role.TOP ? 75. : 90.));
    }

    @Test
    void missingSeedUsesNeutral() {
        assertThat(new RoleSkillCalculator().calculate(List.of(legacy()), List.of(), Map.of()))
                .allSatisfy(s -> assertThat(s.value()).isEqualTo(50.));
    }
}
