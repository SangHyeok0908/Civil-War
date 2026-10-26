package cw.domain;

import cw.contracts.ApiException;
import cw.contracts.EvaluationContracts.RoleSkill;
import cw.contracts.EvaluationContracts.TeamCandidate;
import cw.contracts.EvaluationContracts.TeamRecommendation;
import cw.contracts.EvaluationContracts.TeamSeat;
import cw.contracts.MemberContracts.Member;
import cw.contracts.Role;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class TeamRecommender {
    private static final int TEAM_SIZE = 5;
    private static final int MATCH_SIZE = 2 * TEAM_SIZE;
    private static final int MAX_RECOMMENDATIONS = 3;

    private record Assignment(
            List<TeamSeat> seats, double skill, int preferenceCost, String signature) {}

    private record Candidate(TeamCandidate value, int preferenceCost, String signature) {}

    private static final Comparator<Candidate> CANDIDATE_ORDER =
            Comparator.comparingDouble((Candidate candidate) -> candidate.value().skillDifference())
                    .thenComparingInt(Candidate::preferenceCost)
                    .thenComparing(Candidate::signature);

    public static List<Integer> partitions() {
        List<Integer> result = new ArrayList<>();

        // Keep the first member on team A so swapping the teams does not duplicate a roster.
        for (int mask = 1; mask < (1 << MATCH_SIZE); mask += 2) {
            if (Integer.bitCount(mask) == TEAM_SIZE) {
                result.add(mask);
            }
        }

        return List.copyOf(result);
    }

    public TeamRecommendation recommend(
            List<Member> selected, List<RoleSkill> skills, long revision, double tolerance) {
        validateMembers(selected);

        List<Member> members = selected.stream().sorted(Comparator.comparing(Member::id)).toList();
        String shortageReason = findRoleShortage(members);

        if (shortageReason != null) {
            return new TeamRecommendation(List.of(), shortageReason, revision);
        }

        Map<String, Map<Role, Double>> skillsByMember = indexRoleSkills(members, skills);

        List<Candidate> candidates = new ArrayList<>();

        for (int mask : partitions()) {
            Candidate candidate = bestCandidateForPartition(members, skillsByMember, mask);

            if (candidate != null) {
                candidates.add(candidate);
            }
        }

        candidates.sort(CANDIDATE_ORDER);

        if (candidates.isEmpty()) {
            return new TeamRecommendation(
                    List.of(), "가능한 포지션 조합이 없습니다. 운영자가 가능한 포지션을 확인해 주세요.", revision);
        }

        double bestDifference = candidates.getFirst().value().skillDifference();

        return new TeamRecommendation(
                candidates.stream()
                        .filter(
                                candidate ->
                                        candidate.value().skillDifference()
                                                <= bestDifference + tolerance)
                        .limit(MAX_RECOMMENDATIONS)
                        .map(Candidate::value)
                        .toList(),
                null,
                revision);
    }

    private void validateMembers(List<Member> selected) {
        if (selected.size() != MATCH_SIZE
                || selected.stream().map(Member::id).distinct().count() != MATCH_SIZE
                || selected.stream().anyMatch(member -> !member.active())) {
            throw new ApiException(422, "INVALID_TEAM_MEMBERS");
        }
    }

    private Map<String, Map<Role, Double>> indexRoleSkills(
            List<Member> members, List<RoleSkill> skills) {
        Map<String, Map<Role, Double>> skillsByMember = new HashMap<>();

        for (RoleSkill skill : skills) {
            skillsByMember
                    .computeIfAbsent(skill.memberId(), id -> new EnumMap<>(Role.class))
                    .put(skill.role(), skill.value());
        }

        for (Member member : members) {
            if (!skillsByMember.containsKey(member.id())
                    || skillsByMember.get(member.id()).size() != TEAM_SIZE) {
                throw new IllegalArgumentException("Missing generation role skills");
            }
        }

        return skillsByMember;
    }

    private Candidate bestCandidateForPartition(
            List<Member> members, Map<String, Map<Role, Double>> skillsByMember, int mask) {
        List<Member> teamA = new ArrayList<>();
        List<Member> teamB = new ArrayList<>();

        for (int index = 0; index < MATCH_SIZE; index++) {
            if ((mask & (1 << index)) != 0) {
                teamA.add(members.get(index));
            } else {
                teamB.add(members.get(index));
            }
        }

        return bestAssignmentPair(
                assignments(teamA, skillsByMember), assignments(teamB, skillsByMember));
    }

    private Candidate bestAssignmentPair(
            List<Assignment> teamAAssignments, List<Assignment> teamBAssignments) {
        Candidate best = null;

        for (Assignment teamA : teamAAssignments) {
            for (Assignment teamB : teamBAssignments) {
                double difference = Math.abs(teamA.skill() - teamB.skill());
                int preferenceCost = teamA.preferenceCost() + teamB.preferenceCost();

                // Skip worse scalar priorities before constructing the stable tie-break signature.
                if (best != null
                        && (difference > best.value().skillDifference()
                                || (difference == best.value().skillDifference()
                                        && preferenceCost > best.preferenceCost()))) {
                    continue;
                }

                Candidate candidate =
                        new Candidate(
                                new TeamCandidate(teamA.seats(), teamB.seats(), difference),
                                preferenceCost,
                                teamA.signature() + "|" + teamB.signature());

                if (best == null || CANDIDATE_ORDER.compare(candidate, best) < 0) {
                    best = candidate;
                }
            }
        }

        return best;
    }

    private List<Assignment> assignments(
            List<Member> team, Map<String, Map<Role, Double>> skillsByMember) {
        List<Assignment> result = new ArrayList<>();
        assign(team, skillsByMember, 0, 0, new ArrayList<>(), 0, 0, result);

        return result;
    }

    private void assign(
            List<Member> team,
            Map<String, Map<Role, Double>> skillsByMember,
            int roleIndex,
            int usedMemberMask,
            List<TeamSeat> seats,
            double skill,
            int preferenceCost,
            List<Assignment> result) {
        if (roleIndex == TEAM_SIZE) {
            List<TeamSeat> assignedSeats = List.copyOf(seats);
            result.add(
                    new Assignment(
                            assignedSeats,
                            skill,
                            preferenceCost,
                            assignedSeats.stream()
                                    .map(TeamSeat::memberId)
                                    .reduce(
                                            "",
                                            (signature, memberId) -> signature + "," + memberId)));

            return;
        }

        Role role = Role.values()[roleIndex];

        for (int index = 0; index < TEAM_SIZE; index++) {
            Member member = team.get(index);

            if ((usedMemberMask & (1 << index)) == 0 && member.allowedRoles().contains(role)) {
                seats.add(new TeamSeat(member.id(), role));
                assign(
                        team,
                        skillsByMember,
                        roleIndex + 1,
                        usedMemberMask | (1 << index),
                        seats,
                        skill + skillsByMember.get(member.id()).get(role),
                        preferenceCost + preferenceCost(member, role),
                        result);
                seats.removeLast();
            }
        }
    }

    private int preferenceCost(Member member, Role role) {
        if (member.primaryRole() == role) {
            return 0;
        }

        return member.secondaryRole() == role ? 1 : 2;
    }

    private String findRoleShortage(List<Member> members) {
        for (Member member : members) {
            if (member.allowedRoles().isEmpty()) {
                return member.id() + ": 가능한 포지션이 지정되지 않았습니다. 운영자 확인이 필요합니다.";
            }
        }

        // Hall's condition checks role subsets because individual role counts can hide overlaps.
        for (int mask = 1; mask < 32; mask++) {
            Set<Role> roles = EnumSet.noneOf(Role.class);

            for (int index = 0; index < TEAM_SIZE; index++) {
                if ((mask & (1 << index)) != 0) {
                    roles.add(Role.values()[index]);
                }
            }

            long eligible =
                    members.stream()
                            .filter(
                                    member ->
                                            member.allowedRoles().stream()
                                                    .anyMatch(roles::contains))
                            .count();
            int required = 2 * roles.size();

            if (eligible < required) {
                return roles + " 포지션에 " + required + "명이 필요하지만 가능한 참가자는 " + eligible + "명입니다.";
            }
        }

        return null;
    }
}
