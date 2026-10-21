package cw.domain;

import cw.contracts.*;
import cw.contracts.EvaluationContracts.*;
import java.util.*;

public class MemberAggregator {
  public List<MemberStats> aggregate(EvaluationInput input, List<GameScore> scores) {
    double groupMean = scores.stream().mapToDouble(GameScore::score).average().orElse(0);
    Map<String, Double> adjusted = new HashMap<>(), ranked = new HashMap<>();
    for (var m : input.members()) {
      var ms = scores.stream().filter(s -> s.memberId().equals(m.id())).toList();
      if (!ms.isEmpty()) {
        double value =
            (ms.stream().mapToDouble(GameScore::score).sum()
                    + input.rules().cumulativePrior() * groupMean)
                / (ms.size() + input.rules().cumulativePrior());
        adjusted.put(m.id(), value);
        if (ms.size() >= ScoringRulesV1.parameter(input.rules(), "rankedGames"))
          ranked.put(m.id(), value);
      }
    }
    var ranks = ScoringService.competitionRanks(ranked);
    List<MemberStats> result = new ArrayList<>();
    for (var m : input.members()) {
      var ps =
          input.matches().stream()
              .flatMap(g -> g.participants().stream())
              .filter(p -> p.memberId().equals(m.id()))
              .toList();
      var total = stats(ps);
      Map<Role, RecordStats> byRole = new EnumMap<>(Role.class);
      Map<Integer, RecordStats> byChampion = new TreeMap<>();
      for (var role : Role.values()) {
        var selected = ps.stream().filter(p -> p.role() == role).toList();
        if (!selected.isEmpty()) byRole.put(role, stats(selected));
      }
      for (int champion : ps.stream().map(p -> p.record().championId()).distinct().toList())
        byChampion.put(
            champion, stats(ps.stream().filter(p -> p.record().championId() == champion).toList()));
      result.add(
          new MemberStats(
              m.id(),
              total.games(),
              total.wins(),
              total.losses(),
              total.kills(),
              total.deaths(),
              total.assists(),
              total.kda(),
              adjusted.get(m.id()),
              ranks.get(m.id()),
              ps.isEmpty() ? "unrated" : ranked.containsKey(m.id()) ? "ranked" : "provisional",
              ps.isEmpty() ? 0 : 100. * total.wins() / total.games(),
              total.perfect(),
              Map.copyOf(byRole),
              Map.copyOf(byChampion)));
    }
    return result.stream()
        .sorted(
            Comparator.comparing((MemberStats s) -> s.rank() == null ? Integer.MAX_VALUE : s.rank())
                .thenComparing(MemberStats::memberId))
        .toList();
  }

  private RecordStats stats(List<EvaluableParticipant> ps) {
    long k = 0, d = 0, a = 0;
    int wins = 0;
    for (var p : ps) {
      k = Math.addExact(k, p.record().kills());
      d = Math.addExact(d, p.record().deaths());
      a = Math.addExact(a, p.record().assists());
      if (p.record().win()) wins++;
    }
    return new RecordStats(
        ps.size(),
        wins,
        ps.size() - wins,
        k,
        d,
        a,
        d == 0 ? null : ((double) k + a) / d,
        !ps.isEmpty() && d == 0);
  }
}
