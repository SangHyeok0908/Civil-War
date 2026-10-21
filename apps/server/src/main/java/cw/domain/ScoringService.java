package cw.domain;

import cw.contracts.*;
import cw.contracts.EvaluationContracts.*;
import java.util.*;

public class ScoringService {
  public List<GameScore> scoreMatches(EvaluationInput input) {
    ScoringRulesV1.validate(input.rules());
    if (!input.rules().id().equals(input.scoringVersion()))
      throw new IllegalArgumentException("Mismatched rule version");
    var rows = MatchFeatures.extract(input.matches(), input.rules());
    var rules = input.rules();
    List<GameScore> result = new ArrayList<>();
    for (var row : rows) {
      var p = row.participant();
      var other =
          rows.stream()
              .filter(
                  q ->
                      q.matchKey().equals(row.matchKey())
                          && q.participant().role() == p.role()
                          && !q.participant().memberId().equals(p.memberId()))
              .findFirst()
              .orElseThrow();
      var history =
          rows.stream()
              .filter(
                  q -> !q.matchKey().equals(row.matchKey()) && q.participant().role() == p.role())
              .toList();
      double[] n = new double[row.metrics().length];
      for (int i = 0; i < n.length; i++) {
        final int metric = i;
        n[i] =
            normalize(
                row.metrics()[i],
                other.metrics()[i],
                history.stream().map(q -> q.metrics()[metric]).toList(),
                rules);
      }
      Map<String, Double> b = new LinkedHashMap<>();
      b.put(
          "damage",
          n[0] * ScoringRulesV1.mix(rules, "damagePerMinute")
              + n[1] * ScoringRulesV1.mix(rules, "damageShare"));
      b.put(
          "growth",
          n[2] * ScoringRulesV1.mix(rules, "csPerMinute")
              + n[3] * ScoringRulesV1.mix(rules, "goldPerMinute"));
      b.put(
          "combat",
          p.role() == Role.UTILITY
              ? n[4] * ScoringRulesV1.mix(rules, "supportParticipation")
                  + n[5] * ScoringRulesV1.mix(rules, "supportAssists")
              : n[4]);
      b.put("vision", n[6]);
      b.put("objective", p.role() == Role.TOP ? n[8] : n[7]);
      b.put("deaths", 100 - n[9]);
      b.put("win", p.record().win() ? 100. : 0.);
      double score =
          b.entrySet().stream()
              .mapToDouble(
                  e -> e.getValue() * rules.weightsByRole().get(p.role()).get(e.getKey()) / 100)
              .sum();
      result.add(
          new GameScore(
              row.matchKey(),
              p.memberId(),
              p.role(),
              input.scoringVersion(),
              score,
              0,
              Map.copyOf(b)));
    }
    Map<String, Map<String, Integer>> ranks = new HashMap<>();
    for (var game : input.matches()) {
      Map<String, Double> values = new HashMap<>();
      for (var s : result)
        if (s.matchKey().equals(game.match().matchKey())) values.put(s.memberId(), s.score());
      ranks.put(game.match().matchKey(), competitionRanks(values));
    }
    return result.stream()
        .map(
            s ->
                new GameScore(
                    s.matchKey(),
                    s.memberId(),
                    s.role(),
                    s.scoringVersion(),
                    s.score(),
                    ranks.get(s.matchKey()).get(s.memberId()),
                    s.breakdown()))
        .sorted(
            Comparator.comparing(GameScore::matchKey)
                .thenComparingInt(GameScore::rank)
                .thenComparing(GameScore::memberId))
        .toList();
  }

  public static double normalize(double x, double y, List<Double> history, ScoringRuleSet rules) {
    double neutral = ScoringRulesV1.parameter(rules, "neutral");
    double p =
        x + y == 0
            ? neutral
            : neutral
                + ScoringRulesV1.parameter(rules, "peerCompression")
                    * (100 * x / (x + y) - neutral);
    long lower = history.stream().filter(v -> v < x).count(),
        equal = history.stream().filter(v -> v == x).count();
    double h =
        100
            * (lower + .5 * equal + ScoringRulesV1.parameter(rules, "historyPseudoCount"))
            / (history.size() + ScoringRulesV1.parameter(rules, "historyPrior"));
    double a = history.size() / (history.size() + ScoringRulesV1.parameter(rules, "historyWeight"));
    return Math.clamp(
        (1 - a) * p + a * h,
        ScoringRulesV1.parameter(rules, "min"),
        ScoringRulesV1.parameter(rules, "max"));
  }

  public static long rounded(double score) {
    return Math.round(score * 100);
  }

  public static Map<String, Integer> competitionRanks(Map<String, Double> values) {
    var sorted =
        values.keySet().stream()
            .sorted(
                Comparator.<String>comparingLong(id -> rounded(values.get(id)))
                    .reversed()
                    .thenComparing(id -> id))
            .toList();
    Map<String, Integer> result = new HashMap<>();
    long previous = Long.MIN_VALUE;
    int rank = 0;
    for (int i = 0; i < sorted.size(); i++) {
      String id = sorted.get(i);
      long value = rounded(values.get(id));
      if (value != previous) rank = i + 1;
      result.put(id, rank);
      previous = value;
    }
    return result;
  }
}
