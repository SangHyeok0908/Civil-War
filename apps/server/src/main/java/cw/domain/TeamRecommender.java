package cw.domain;

import cw.contracts.*;
import cw.contracts.EvaluationContracts.*;
import cw.contracts.MemberContracts.Member;
import java.util.*;

public class TeamRecommender {
  private record Assignment(List<TeamSeat> seats, double skill, int preference, String key) {}

  private record Candidate(TeamCandidate value, int preference, String key) {}

  public static List<Integer> partitions() {
    List<Integer> result = new ArrayList<>();
    for (int mask = 1; mask < 1024; mask += 2) if (Integer.bitCount(mask) == 5) result.add(mask);
    return List.copyOf(result);
  }

  public TeamRecommendation recommend(
      List<Member> selected, List<RoleSkill> skills, long revision, double tolerance) {
    if (selected.size() != 10
        || selected.stream().map(Member::id).distinct().count() != 10
        || selected.stream().anyMatch(m -> !m.active()))
      throw new ApiException(422, "INVALID_TEAM_MEMBERS");
    var members = selected.stream().sorted(Comparator.comparing(Member::id)).toList();
    String impossible = shortage(members);
    if (impossible != null) return new TeamRecommendation(List.of(), impossible, revision);
    Map<String, Map<Role, Double>> values = new HashMap<>();
    for (var s : skills)
      values
          .computeIfAbsent(s.memberId(), id -> new EnumMap<>(Role.class))
          .put(s.role(), s.value());
    for (var m : members)
      if (!values.containsKey(m.id()) || values.get(m.id()).size() != 5)
        throw new IllegalArgumentException("Missing generation role skills");
    Comparator<Candidate> order =
        Comparator.comparingDouble((Candidate c) -> c.value().skillDifference())
            .thenComparingInt(Candidate::preference)
            .thenComparing(Candidate::key);
    List<Candidate> candidates = new ArrayList<>();
    for (int mask : partitions()) {
      List<Member> a = new ArrayList<>(), b = new ArrayList<>();
      for (int i = 0; i < 10; i++) ((mask & (1 << i)) != 0 ? a : b).add(members.get(i));
      var aa = assignments(a, values);
      var bb = assignments(b, values);
      Candidate best = null;
      for (var x : aa)
        for (var y : bb) {
          double difference = Math.abs(x.skill() - y.skill());
          int cost = x.preference() + y.preference();
          // Compare scalar priorities first; construct stable signature only for contenders.
          if (best != null
              && (difference > best.value().skillDifference()
                  || (difference == best.value().skillDifference() && cost > best.preference())))
            continue;
          var c =
              new Candidate(
                  new TeamCandidate(x.seats(), y.seats(), difference),
                  cost,
                  x.key() + "|" + y.key());
          if (best == null || order.compare(c, best) < 0) best = c;
        }
      if (best != null) candidates.add(best);
    }
    candidates.sort(order);
    if (candidates.isEmpty())
      return new TeamRecommendation(
          List.of(), "가능한 포지션 조합이 없습니다. 운영자가 가능한 포지션을 확인해 주세요.", revision);
    double best = candidates.getFirst().value().skillDifference();
    return new TeamRecommendation(
        candidates.stream()
            .filter(c -> c.value().skillDifference() <= best + tolerance)
            .limit(3)
            .map(Candidate::value)
            .toList(),
        null,
        revision);
  }

  private List<Assignment> assignments(List<Member> team, Map<String, Map<Role, Double>> values) {
    List<Assignment> result = new ArrayList<>();
    assign(team, values, 0, 0, new ArrayList<>(), 0, 0, result);
    return result;
  }

  private void assign(
      List<Member> team,
      Map<String, Map<Role, Double>> values,
      int roleIndex,
      int used,
      List<TeamSeat> seats,
      double skill,
      int preference,
      List<Assignment> result) {
    if (roleIndex == 5) {
      var copy = List.copyOf(seats);
      result.add(
          new Assignment(
              copy,
              skill,
              preference,
              copy.stream().map(TeamSeat::memberId).reduce("", (a, b) -> a + "," + b)));
      return;
    }
    var role = Role.values()[roleIndex];
    for (int i = 0; i < 5; i++) {
      var m = team.get(i);
      if ((used & (1 << i)) == 0 && m.allowedRoles().contains(role)) {
        seats.add(new TeamSeat(m.id(), role));
        assign(
            team,
            values,
            roleIndex + 1,
            used | (1 << i),
            seats,
            skill + values.get(m.id()).get(role),
            preference + (m.primaryRole() == role ? 0 : m.secondaryRole() == role ? 1 : 2),
            result);
        seats.removeLast();
      }
    }
  }

  private String shortage(List<Member> members) {
    for (var m : members)
      if (m.allowedRoles().isEmpty()) return m.id() + ": 가능한 포지션이 지정되지 않았습니다. 운영자 확인이 필요합니다.";
    // Hall's condition over the ten role seats; overlapping eligibility can fail despite individual
    // role counts.
    for (int mask = 1; mask < 32; mask++) {
      Set<Role> roles = EnumSet.noneOf(Role.class);
      for (int i = 0; i < 5; i++) if ((mask & (1 << i)) != 0) roles.add(Role.values()[i]);
      long eligible =
          members.stream().filter(m -> m.allowedRoles().stream().anyMatch(roles::contains)).count();
      int required = 2 * roles.size();
      if (eligible < required)
        return roles + " 포지션에 " + required + "명이 필요하지만 가능한 참가자는 " + eligible + "명입니다.";
    }
    return null;
  }
}
