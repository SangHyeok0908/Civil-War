package cw.evaluation;

import cw.contracts.EvaluationContracts.EvaluableMatch;
import cw.contracts.EvaluationContracts.EvaluableParticipant;
import cw.contracts.EvaluationContracts.EvaluationInput;
import cw.contracts.EvaluationContracts.ScoringRuleSet;
import cw.contracts.MatchContracts.NormalizedMatch;
import cw.contracts.MatchContracts.ParticipantRecord;
import cw.db.ServiceState;
import cw.matches.MatchEntity;
import cw.matches.MatchParticipantEntity;
import cw.matches.MatchViews;
import cw.members.MemberService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Service
public class EvaluationSnapshot {
    @PersistenceContext private EntityManager em;
    private final MatchViews views;
    private final MemberService members;
    private final JsonMapper json;

    public EvaluationSnapshot(MatchViews views, MemberService members, JsonMapper json) {
        this.views = views;
        this.members = members;
        this.json = json;
    }

    @Transactional(
            readOnly = true,
            isolation = Isolation.REPEATABLE_READ,
            propagation = Propagation.REQUIRES_NEW)
    public EvaluationInput capture() {
        ServiceState state = em.find(ServiceState.class, 1);
        ScoringRuleSet rules =
                json.readValue(
                        em.find(ScoringVersionEntity.class, state.desiredScoringVersion).rulesJson,
                        ScoringRuleSet.class);
        List<MatchEntity> matches =
                em.createQuery(
                                "select distinct m from MatchEntity m left join fetch m.participants where"
                                        + " m.state='registered' order by m.id",
                                MatchEntity.class)
                        .getResultList();

        List<EvaluableMatch> games = new ArrayList<>();

        for (MatchEntity m : matches) {
            NormalizedMatch normalized = views.normalized(m);

            List<EvaluableParticipant> ps = new ArrayList<>();

            for (MatchParticipantEntity p : m.participants) {
                ParticipantRecord record =
                        normalized.participants().stream()
                                .filter(r -> r.puuid().equals(p.puuid))
                                .findFirst()
                                .orElseThrow();
                ps.add(new EvaluableParticipant(p.memberId, p.role, record));
            }

            games.add(new EvaluableMatch(normalized, List.copyOf(ps)));
        }

        return new EvaluationInput(
                state.sourceRevision,
                state.desiredScoringVersion,
                rules,
                List.copyOf(games),
                members.list());
    }
}
