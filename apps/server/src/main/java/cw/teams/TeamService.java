package cw.teams;

import cw.contracts.ApiException;
import cw.contracts.EvaluationContracts.EvaluationGeneration;
import cw.contracts.EvaluationContracts.RankLookup;
import cw.contracts.EvaluationContracts.TeamRecommendation;
import cw.contracts.MemberContracts.Member;
import cw.domain.RoleSkillCalculator;
import cw.domain.TeamRecommender;
import cw.evaluation.EvaluationRepository;
import cw.members.MemberService;
import cw.riot.LiveRankLookup;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class TeamService {
    private record Inputs(List<Member> selected, EvaluationGeneration generation) {}

    private final EvaluationRepository evaluations;
    private final MemberService members;
    private final LiveRankLookup ranks;
    private final TransactionTemplate read;
    private final Map<String, TeamRecommendation> cache =
            Collections.synchronizedMap(
                    new LinkedHashMap<>(16, .75f, true) {
                        @Override
                        protected boolean removeEldestEntry(
                                Map.Entry<String, TeamRecommendation> e) {
                            return size() > 128;
                        }
                    });

    public TeamService(
            EvaluationRepository evaluations,
            MemberService members,
            LiveRankLookup ranks,
            PlatformTransactionManager manager) {
        this.evaluations = evaluations;
        this.members = members;
        this.ranks = ranks;
        this.read = new TransactionTemplate(manager);
        read.setReadOnly(true);
        read.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }

    public TeamRecommendation recommend(List<String> ids) {
        if (ids == null
                || ids.size() != 10
                || ids.stream().anyMatch(Objects::isNull)
                || new HashSet<>(ids).size() != 10) {
            throw new ApiException(422, "INVALID_TEAM_MEMBERS");
        }

        Inputs inputs = read.execute(transaction -> inputs(ids));
        EvaluationGeneration g = inputs.generation();

        // Riot lookups run outside any database transaction; each result is saved on its own.
        List<RankLookup> lookups = ranks.lookup(ids);
        Map<String, Double> seeds =
                lookups.stream()
                        .collect(Collectors.toMap(RankLookup::memberId, RankLookup::teamSeed));

        String key =
                g.sourceRevision()
                        + ":"
                        + g.id()
                        + ":"
                        + ids.stream()
                                .sorted()
                                .map(id -> id + "=" + seeds.get(id))
                                .collect(Collectors.joining(","));
        TeamRecommendation result = cache.get(key);

        if (result == null) {
            result =
                    new TeamRecommender()
                            .recommend(
                                    inputs.selected(),
                                    new RoleSkillCalculator()
                                            .calculate(inputs.selected(), g.gameScores(), seeds),
                                    g.sourceRevision(),
                                    5);

            cache.put(key, result);
        }

        return result.withRankLookups(lookups);
    }

    private Inputs inputs(List<String> ids) {
        List<Member> selected = members.list().stream().filter(m -> ids.contains(m.id())).toList();

        if (selected.size() != 10 || selected.stream().anyMatch(m -> !m.active())) {
            throw new ApiException(422, "INVALID_TEAM_MEMBERS");
        }

        EvaluationGeneration g = evaluations.current();

        if (g == null) {
            throw new ApiException(202, "RECALCULATING");
        }

        return new Inputs(selected, g);
    }
}
