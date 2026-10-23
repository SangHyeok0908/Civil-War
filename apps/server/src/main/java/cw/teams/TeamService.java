package cw.teams;

import cw.contracts.*;
import cw.contracts.EvaluationContracts.*;
import cw.domain.TeamRecommender;
import cw.evaluation.EvaluationRepository;
import cw.members.MemberService;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class TeamService {
    private final EvaluationRepository evaluations;
    private final MemberService members;
    private final Map<String, TeamRecommendation> cache =
            Collections.synchronizedMap(
                    new LinkedHashMap<>(16, .75f, true) {
                        @Override
                        protected boolean removeEldestEntry(
                                Map.Entry<String, TeamRecommendation> e) {
                            return size() > 128;
                        }
                    });

    public TeamService(EvaluationRepository evaluations, MemberService members) {
        this.evaluations = evaluations;
        this.members = members;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public TeamRecommendation recommend(List<String> ids) {
        if (ids == null
                || ids.size() != 10
                || ids.stream().anyMatch(Objects::isNull)
                || new HashSet<>(ids).size() != 10) {
            throw new ApiException(422, "INVALID_TEAM_MEMBERS");
        }
        var selected = members.list().stream().filter(m -> ids.contains(m.id())).toList();
        if (selected.size() != 10 || selected.stream().anyMatch(m -> !m.active())) {
            throw new ApiException(422, "INVALID_TEAM_MEMBERS");
        }
        var g = evaluations.current();
        if (g == null) {
            throw new ApiException(202, "RECALCULATING");
        }
        String key =
                g.sourceRevision()
                        + ":"
                        + g.id()
                        + ":"
                        + String.join(",", ids.stream().sorted().toList());
        var result = cache.get(key);
        if (result == null) {
            result =
                    new TeamRecommender()
                            .recommend(selected, g.roleSkills(), g.sourceRevision(), 5);
            cache.put(key, result);
        }
        return result;
    }
}
