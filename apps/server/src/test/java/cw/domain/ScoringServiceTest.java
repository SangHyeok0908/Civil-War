package cw.domain;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.EvaluationContracts.EvaluableMatch;
import cw.contracts.EvaluationContracts.EvaluableParticipant;
import cw.contracts.EvaluationContracts.EvaluationInput;
import cw.contracts.EvaluationContracts.GameScore;
import cw.contracts.EvaluationContracts.ScoringRuleSet;
import cw.contracts.MatchContracts.NormalizedMatch;
import cw.contracts.MatchContracts.ParticipantRecord;
import cw.contracts.MemberContracts.Member;
import cw.contracts.Role;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class ScoringServiceTest {
    static List<Member> members() {
        return IntStream.range(0, 11)
                .mapToObj(
                        i ->
                                new Member(
                                        "m" + i,
                                        "p" + i,
                                        "test",
                                        "선수 " + i,
                                        true,
                                        Role.values()[i % 5],
                                        null,
                                        List.of(Role.values()),
                                        50,
                                        1))
                .toList();
    }

    static EvaluableMatch game(String id, boolean zero) {
        List<EvaluableParticipant> ps = new ArrayList<>();

        for (int i = 0; i < 10; i++) {
            ParticipantRecord p =
                    new ParticipantRecord(
                            "p" + i,
                            i < 5 ? 100 : 200,
                            i < 5,
                            1,
                            zero ? 0 : 2,
                            zero ? 0 : 1,
                            zero ? 0 : 3,
                            zero ? 0 : 600,
                            0,
                            zero ? 0 : 10,
                            0,
                            zero ? 0 : 600,
                            zero ? 0 : 10,
                            zero ? 0 : 60,
                            zero ? 0 : 60,
                            List.of(0L, 0L, 0L, 0L, 0L, 0L, 0L));
            ps.add(new EvaluableParticipant("m" + i, Role.values()[i % 5], p));
        }

        return new EvaluableMatch(
                new NormalizedMatch(
                        1,
                        "KR",
                        id,
                        Instant.EPOCH,
                        600,
                        11,
                        "CUSTOM_GAME",
                        "16.20",
                        ps.stream().map(EvaluableParticipant::record).toList()),
                ps);
    }

    static EvaluationInput input(List<EvaluableMatch> games) {
        ScoringRuleSet rules = ScoringRulesV1.defaults();
        return new EvaluationInput(1, rules.id(), rules, games, members());
    }

    @Test
    void newEvaluationsUseConfirmedVersion() {
        List<GameScore> scores =
                new ScoringService().scoreMatches(input(List.of(game("1", false))));
        assertThat(scores)
                .allSatisfy(s -> assertThat(s.scoringVersion()).isEqualTo("objective-position-v1"));
    }

    @ParameterizedTest
    @EnumSource(Role.class)
    void confirmedObjectiveUsesOnlySelectedPerMinuteMetric(Role role) {
        EvaluableMatch g = game("1", false);
        ArrayList<EvaluableParticipant> ps = new ArrayList<>(g.participants());
        int index = role.ordinal();
        EvaluableParticipant p = ps.get(index);
        ParticipantRecord r = p.record();
        ps.set(
                index,
                new EvaluableParticipant(
                        p.memberId(),
                        role,
                        new ParticipantRecord(
                                r.puuid(),
                                r.teamId(),
                                r.win(),
                                r.championId(),
                                r.kills(),
                                r.deaths(),
                                r.assists(),
                                r.championDamage(),
                                r.damageTaken(),
                                r.laneCs(),
                                r.neutralCs(),
                                r.goldEarned(),
                                r.visionScore(),
                                180,
                                30,
                                r.items())));
        GameScore s =
                new ScoringService()
                        .scoreMatches(input(List.of(new EvaluableMatch(g.match(), ps)))).stream()
                                .filter(v -> v.memberId().equals(p.memberId()))
                                .findFirst()
                                .orElseThrow();
        assertThat(s.breakdown().get("objective"))
                .isCloseTo(role == Role.TOP ? 41.66666666666667 : 62.5, within(1e-10));
        MatchFeatures.Row row =
                MatchFeatures.extract(
                                List.of(new EvaluableMatch(g.match(), ps)),
                                ScoringRulesV1.defaults())
                        .stream()
                        .filter(v -> v.participant().memberId().equals(p.memberId()))
                        .findFirst()
                        .orElseThrow();
        assertThat(row.metrics()[7]).isEqualTo(18);
        assertThat(row.metrics()[8]).isEqualTo(3);
    }

    @Test
    void manualCalculationGolden() {
        EvaluationInput input = input(List.of(game("1", false)));
        List<GameScore> scores = new ScoringService().scoreMatches(input);
        assertThat(scores).hasSize(10);
        assertThat(
                        scores.stream()
                                .filter(s -> s.memberId().equals("m0"))
                                .findFirst()
                                .orElseThrow()
                                .score())
                .isEqualTo(52.5);
        assertThat(
                        scores.stream()
                                .filter(s -> s.memberId().equals("m5"))
                                .findFirst()
                                .orElseThrow()
                                .score())
                .isEqualTo(47.5);
        assertThat(scores.stream().filter(s -> s.rank() == 1)).hasSize(5);
        assertThat(scores.stream().filter(s -> s.rank() == 6)).hasSize(5);
    }

    @Test
    void zeroDenominatorsFinite() {
        for (GameScore s :
                new ScoringService()
                        .scoreMatches(input(List.of(game("1", true), game("2", true))))) {
            assertThat(s.score()).isFinite().isBetween(0., 100.);
            assertThat(s.breakdown().get("damage")).isEqualTo(50.);
            assertThat(s.breakdown().get("deaths")).isEqualTo(50.);
        }
    }

    @Test
    void exactHistoryGoldenAndCurrentGameExclusion() {
        // P=62.5, H=100*(2+0+5)/12=58.3333, a=2/22; both current players excluded.
        assertThat(ScoringService.normalize(3, 1, List.of(0., 2.), ScoringRulesV1.defaults()))
                .isCloseTo(62.121212121212125, within(1e-10));

        EvaluationInput input =
                input(List.of(game("1", false), game("2", false), game("3", false)));
        assertThat(new ScoringService().scoreMatches(input))
                .allSatisfy(s -> assertThat(s.score()).isIn(52.5, 47.5));
    }

    @Test
    void sameRoleOnly() {
        EvaluableMatch base = game("1", false);
        EvaluableMatch history = game("2", false);

        ArrayList<EvaluableParticipant> changed = new ArrayList<>(history.participants());
        EvaluableParticipant p = changed.get(1);
        ParticipantRecord r = p.record();
        changed.set(
                1,
                new EvaluableParticipant(
                        p.memberId(),
                        p.role(),
                        new ParticipantRecord(
                                r.puuid(),
                                r.teamId(),
                                r.win(),
                                1,
                                r.kills(),
                                0,
                                999,
                                r.championDamage(),
                                0,
                                9999,
                                9999,
                                999999,
                                99999,
                                999999,
                                999999,
                                r.items())));

        ScoringService service = new ScoringService();
        List<GameScore> a =
                service.scoreMatches(input(List.of(base, history))).stream()
                        .filter(s -> s.matchKey().equals("KR:1") && s.role() == Role.TOP)
                        .toList();
        List<GameScore> b =
                service
                        .scoreMatches(
                                input(List.of(base, new EvaluableMatch(history.match(), changed))))
                        .stream()
                        .filter(s -> s.matchKey().equals("KR:1") && s.role() == Role.TOP)
                        .toList();
        assertThat(b).isEqualTo(a);
    }

    @Test
    void seedAndSoloCannotAffectRank() {
        EvaluationInput a = input(List.of(game("1", false)));
        List<Member> changed =
                a.members().stream()
                        .map(
                                m ->
                                        new Member(
                                                m.id(),
                                                m.puuid(),
                                                m.riotId(),
                                                m.displayName(),
                                                m.active(),
                                                m.primaryRole(),
                                                m.secondaryRole(),
                                                m.allowedRoles(),
                                                0,
                                                m.profileRevision()))
                        .toList();
        assertThat(
                        new ScoringService()
                                .scoreMatches(
                                        new EvaluationInput(
                                                1,
                                                a.scoringVersion(),
                                                a.rules(),
                                                a.matches(),
                                                changed)))
                .isEqualTo(new ScoringService().scoreMatches(a));
    }

    @Test
    void loserCanRankFirst() {
        EvaluableMatch g = game("1", false);

        ArrayList<EvaluableParticipant> ps = new ArrayList<>(g.participants());
        EvaluableParticipant p = ps.get(5);
        ParticipantRecord r = p.record();
        ps.set(
                5,
                new EvaluableParticipant(
                        p.memberId(),
                        p.role(),
                        new ParticipantRecord(
                                r.puuid(), 200, false, 1, 100, 0, 100, 100000, 0, 1000, 1000,
                                100000, 10000, 100000, 100000, r.items())));

        List<GameScore> scores =
                new ScoringService()
                        .scoreMatches(input(List.of(new EvaluableMatch(g.match(), ps))));
        assertThat(
                        scores.stream()
                                .filter(s -> s.memberId().equals("m5"))
                                .findFirst()
                                .orElseThrow()
                                .rank())
                .isEqualTo(1);
    }

    @Test
    void objectiveOverlapPolicyAndUnconfirmedRejected() {
        EvaluableMatch g = game("1", false);

        ArrayList<EvaluableParticipant> ps = new ArrayList<>(g.participants());
        EvaluableParticipant p = ps.get(2);
        ParticipantRecord r = p.record();
        ps.set(
                2,
                new EvaluableParticipant(
                        p.memberId(),
                        p.role(),
                        new ParticipantRecord(
                                r.puuid(),
                                r.teamId(),
                                r.win(),
                                1,
                                r.kills(),
                                r.deaths(),
                                r.assists(),
                                r.championDamage(),
                                0,
                                r.laneCs(),
                                r.neutralCs(),
                                r.goldEarned(),
                                r.visionScore(),
                                r.objectiveDamage(),
                                999999,
                                r.items())));
        assertThat(
                        new ScoringService()
                                .scoreMatches(input(List.of(new EvaluableMatch(g.match(), ps)))))
                .isEqualTo(new ScoringService().scoreMatches(input(List.of(g))));
        ps.set(2, new EvaluableParticipant(p.memberId(), null, r));
        assertThatThrownBy(
                        () ->
                                new ScoringService()
                                        .scoreMatches(
                                                input(List.of(new EvaluableMatch(g.match(), ps)))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void displayRoundedCompetitionTies() {
        assertThat(ScoringService.competitionRanks(Map.of("a", 50.001, "b", 50.004, "c", 49.99)))
                .containsEntry("a", 1)
                .containsEntry("b", 1)
                .containsEntry("c", 3);
    }
}
