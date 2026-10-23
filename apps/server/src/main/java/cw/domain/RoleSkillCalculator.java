package cw.domain;

import cw.contracts.*;
import cw.contracts.EvaluationContracts.*;
import cw.contracts.MemberContracts.Member;
import java.util.*;

public class RoleSkillCalculator {
    public List<RoleSkill> calculate(List<Member> members, List<GameScore> scores) {
        List<RoleSkill> result = new ArrayList<>();
        for (var m : members) {
            for (var role : Role.values()) {
                var selected =
                        scores.stream()
                                .filter(s -> s.memberId().equals(m.id()) && s.role() == role)
                                .toList();
                result.add(
                        new RoleSkill(
                                m.id(),
                                role,
                                (5. * m.seedSkill()
                                                + selected.stream()
                                                        .mapToDouble(GameScore::score)
                                                        .sum())
                                        / (5 + selected.size()),
                                selected.size()));
            }
        }
        return List.copyOf(result);
    }
}
