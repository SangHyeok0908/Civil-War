package cw.domain;

import cw.contracts.*;
import cw.contracts.EvaluationContracts.ScoringRuleSet;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;

/** Complete immutable parameters of the provisional algorithm, never mutable global tuning. */
public final class ScoringRulesV1 {
  public static final List<String> CATEGORIES =
      List.of("damage", "growth", "combat", "vision", "objective", "deaths", "win");

  private ScoringRulesV1() {}

  public static ScoringRuleSet defaults() {
    int[][] weights = {
      {20, 25, 15, 10, 20, 5, 5},
      {10, 15, 35, 10, 20, 5, 5},
      {30, 25, 20, 5, 10, 5, 5},
      {40, 25, 15, 5, 5, 5, 5},
      {5, 0, 40, 40, 5, 5, 5}
    };
    Map<Role, Map<String, Double>> byRole = new EnumMap<>(Role.class);
    for (var r : Role.values()) {
      Map<String, Double> w = new LinkedHashMap<>();
      for (int i = 0; i < 7; i++) w.put(CATEGORIES.get(i), (double) weights[r.ordinal()][i]);
      byRole.put(r, Map.copyOf(w));
    }
    var json = JsonMapper.builder().build();
    return new ScoringRuleSet(
        "objective-provisional-v1",
        "objective-provisional-v1",
        Map.copyOf(byRole),
        json.readTree(
            "{\"damagePerMinute\":0.7,\"damageShare\":0.3,\"csPerMinute\":0.5,\"goldPerMinute\":0.5,\"supportParticipation\":0.7,\"supportAssists\":0.3}"),
        json.readTree(
            "{\"neutral\":50,\"peerCompression\":0.5,\"historyPseudoCount\":5,\"historyPrior\":10,\"historyWeight\":20,\"min\":5,\"max\":95,\"deathMinutes\":10,\"roleSkillPrior\":5,\"rankedGames\":3,\"teamTolerance\":5}"),
        5);
  }

  public static double parameter(ScoringRuleSet r, String key) {
    return r.normalization().get(key).asDouble();
  }

  public static double mix(ScoringRuleSet r, String key) {
    return r.metricMix().get(key).asDouble();
  }

  public static void validate(ScoringRuleSet r) {
    if (r == null
        || r.id() == null
        || !r.id().matches("[A-Za-z0-9_-]{1,100}")
        || !"objective-provisional-v1".equals(r.algorithmVersion())
        || r.cumulativePrior() != 5
        || r.weightsByRole() == null
        || r.weightsByRole().size() != 5) invalid();
    for (var role : Role.values()) {
      var w = r.weightsByRole().get(role);
      if (w == null
          || !w.keySet().equals(new HashSet<>(CATEGORIES))
          || w.values().stream().anyMatch(v -> v == null || !Double.isFinite(v) || v < 0)
          || Math.abs(w.values().stream().mapToDouble(Double::doubleValue).sum() - 100) > 1e-8
          || w.get("win") > 5) invalid();
    }
    // Algorithm constants are versioned and persisted in full. Changing the algorithm requires a
    // new supported implementation.
    var d = defaults();
    var normalization = r.normalization();
    if (normalization == null
        || !normalization.isObject()
        || !new HashSet<>(normalization.propertyNames())
            .equals(new HashSet<>(d.normalization().propertyNames()))) invalid();
    for (var key : d.normalization().propertyNames())
      if (!normalization.get(key).isNumber()
          || Double.compare(
                  normalization.get(key).asDouble(), d.normalization().get(key).asDouble())
              != 0) invalid();
    var mix = r.metricMix();
    if (mix == null
        || !mix.isObject()
        || !new HashSet<>(mix.propertyNames()).equals(new HashSet<>(d.metricMix().propertyNames())))
      invalid();
    for (var k : mix.propertyNames())
      if (!mix.get(k).isNumber()
          || !Double.isFinite(mix.get(k).asDouble())
          || mix.get(k).asDouble() < 0
          || mix.get(k).asDouble() > 1) invalid();
    for (var pair :
        List.of(
            List.of("damagePerMinute", "damageShare"),
            List.of("csPerMinute", "goldPerMinute"),
            List.of("supportParticipation", "supportAssists")))
      if (Math.abs(mix.get(pair.get(0)).asDouble() + mix.get(pair.get(1)).asDouble() - 1) > 1e-8)
        invalid();
  }

  private static void invalid() {
    throw new ApiException(422, "INVALID_SCORING_RULES");
  }
}
