package cw.domain;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.EvaluationContracts.EvaluationInput;
import cw.contracts.EvaluationContracts.MemberStats;
import java.util.List;
import org.junit.jupiter.api.Test;

class MemberAggregatorTest {
    @Test
    void threeGameThreshold() {
        EvaluationInput a = ScoringServiceTest.input(List.of(ScoringServiceTest.game("1", false)));
        List<MemberStats> stats =
                new MemberAggregator().aggregate(a, new ScoringService().scoreMatches(a));
        MemberStats winner =
                stats.stream().filter(s -> s.memberId().equals("m0")).findFirst().orElseThrow();
        assertThat(winner.adjustedScore()).isCloseTo(50.4166666666667, within(1e-10));
        assertThat(winner.status()).isEqualTo("provisional");
        assertThat(winner.rank()).isNull();

        MemberStats empty =
                stats.stream().filter(s -> s.memberId().equals("m10")).findFirst().orElseThrow();
        assertThat(empty.games()).isZero();
        assertThat(empty.adjustedScore()).isNull();
        assertThat(empty.rank()).isNull();

        a =
                ScoringServiceTest.input(
                        List.of(
                                ScoringServiceTest.game("1", false),
                                ScoringServiceTest.game("2", false),
                                ScoringServiceTest.game("3", false)));
        stats = new MemberAggregator().aggregate(a, new ScoringService().scoreMatches(a));
        winner = stats.stream().filter(s -> s.memberId().equals("m0")).findFirst().orElseThrow();

        assertThat(winner.status()).isEqualTo("ranked");
        assertThat(winner.adjustedScore()).isEqualTo(50.9375);
        assertThat(winner.rank()).isEqualTo(1);
        assertThat(winner.kills()).isEqualTo(6);
        assertThat(winner.deaths()).isEqualTo(3);
        assertThat(winner.assists()).isEqualTo(9);
        assertThat(winner.kda()).isEqualTo(5.);
        assertThat(winner.byRole()).hasSize(1);
        assertThat(winner.byChampion()).hasSize(1);
    }

    @Test
    void cancelReturnsToProvisional() {
        EvaluationInput a =
                ScoringServiceTest.input(
                        List.of(
                                ScoringServiceTest.game("1", false),
                                ScoringServiceTest.game("2", false)));
        assertThat(new MemberAggregator().aggregate(a, new ScoringService().scoreMatches(a)))
                .filteredOn(s -> s.games() > 0)
                .allSatisfy(
                        s -> {
                            assertThat(s.status()).isEqualTo("provisional");
                            assertThat(s.rank()).isNull();
                        });
    }

    @Test
    void zeroDeathsArePerfectNotInfinity() {
        EvaluationInput a = ScoringServiceTest.input(List.of(ScoringServiceTest.game("1", true)));
        assertThat(new MemberAggregator().aggregate(a, new ScoringService().scoreMatches(a)))
                .filteredOn(s -> s.games() > 0)
                .allSatisfy(
                        s -> {
                            assertThat(s.kda()).isNull();
                            assertThat(s.perfect()).isTrue();
                        });
    }
}
