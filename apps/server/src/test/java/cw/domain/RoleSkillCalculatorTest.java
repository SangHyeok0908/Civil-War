package cw.domain;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.EvaluationContracts.GameScore;
import cw.contracts.MemberContracts.Member;
import cw.contracts.Role;
import java.util.List;
import java.util.Map;
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
                                .calculate(List.of(legacy()), List.of())
                                .getFirst()
                                .value())
                .isEqualTo(50.);
    }

    @Test
    void fiveGamePriorMixesWithHistory() {
        GameScore score = new GameScore("game", "m", Role.TOP, "version", 80., 1, Map.of());
        assertThat(
                        new RoleSkillCalculator()
                                .calculate(List.of(legacy()), List.of(score)).stream()
                                        .filter(s -> s.role() == Role.TOP)
                                        .findFirst()
                                        .orElseThrow()
                                        .value())
                .isEqualTo(55.);
    }
}
