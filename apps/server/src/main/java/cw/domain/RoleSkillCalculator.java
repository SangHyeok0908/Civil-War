package cw.domain;

import cw.contracts.EvaluationContracts.GameScore;
import cw.contracts.EvaluationContracts.RoleSkill;
import cw.contracts.MemberContracts.Member;
import cw.contracts.Role;
import java.util.ArrayList;
import java.util.List;

public class RoleSkillCalculator {
    public List<RoleSkill> calculate(List<Member> members, List<GameScore> scores) {
        List<RoleSkill> result = new ArrayList<>();

        for (Member m : members) {
            for (Role role : Role.values()) {
                List<GameScore> selected =
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
