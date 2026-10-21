package cw.domain;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.*;
import cw.contracts.EvaluationContracts.*;
import cw.contracts.MatchContracts.*;
import cw.contracts.MemberContracts.Member;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;

class ScoringServiceTest {
  static List<Member> members() {
    return java.util.stream.IntStream.range(0, 11)
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
      var p =
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
    var rules = ScoringRulesV1.defaults();
    return new EvaluationInput(1, rules.id(), rules, games, members());
  }

  @Test
  void manualCalculationGolden() {
    var input = input(List.of(game("1", false)));
    var scores = new ScoringService().scoreMatches(input);
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
    for (var s :
        new ScoringService().scoreMatches(input(List.of(game("1", true), game("2", true))))) {
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
    var input = input(List.of(game("1", false), game("2", false), game("3", false)));
    assertThat(new ScoringService().scoreMatches(input))
        .allSatisfy(s -> assertThat(s.score()).isIn(52.5, 47.5));
  }

  @Test
  void sameRoleOnly() {
    var base = game("1", false);
    var history = game("2", false);
    var changed = new ArrayList<>(history.participants());
    var p = changed.get(1);
    var r = p.record();
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
    var service = new ScoringService();
    var a =
        service.scoreMatches(input(List.of(base, history))).stream()
            .filter(s -> s.matchKey().equals("KR:1") && s.role() == Role.TOP)
            .toList();
    var b =
        service
            .scoreMatches(input(List.of(base, new EvaluableMatch(history.match(), changed))))
            .stream()
            .filter(s -> s.matchKey().equals("KR:1") && s.role() == Role.TOP)
            .toList();
    assertThat(b).isEqualTo(a);
  }

  @Test
  void seedAndSoloCannotAffectRank() {
    var a = input(List.of(game("1", false)));
    var changed =
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
                    new EvaluationInput(1, a.scoringVersion(), a.rules(), a.matches(), changed)))
        .isEqualTo(new ScoringService().scoreMatches(a));
  }

  @Test
  void loserCanRankFirst() {
    var g = game("1", false);
    var ps = new ArrayList<>(g.participants());
    var p = ps.get(5);
    var r = p.record();
    ps.set(
        5,
        new EvaluableParticipant(
            p.memberId(),
            p.role(),
            new ParticipantRecord(
                r.puuid(), 200, false, 1, 100, 0, 100, 100000, 0, 1000, 1000, 100000, 10000, 100000,
                100000, r.items())));
    var scores =
        new ScoringService().scoreMatches(input(List.of(new EvaluableMatch(g.match(), ps))));
    assertThat(
            scores.stream().filter(s -> s.memberId().equals("m5")).findFirst().orElseThrow().rank())
        .isEqualTo(1);
  }

  @Test
  void objectiveOverlapPolicyAndUnconfirmedRejected() {
    var g = game("1", false);
    var ps = new ArrayList<>(g.participants());
    var p = ps.get(2);
    var r = p.record();
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
    assertThat(new ScoringService().scoreMatches(input(List.of(new EvaluableMatch(g.match(), ps)))))
        .isEqualTo(new ScoringService().scoreMatches(input(List.of(g))));
    ps.set(2, new EvaluableParticipant(p.memberId(), null, r));
    assertThatThrownBy(
            () ->
                new ScoringService()
                    .scoreMatches(input(List.of(new EvaluableMatch(g.match(), ps)))))
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
