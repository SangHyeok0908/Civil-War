package cw.evaluation;

import cw.contracts.EvaluationContracts.*;
import cw.db.ServiceState;
import cw.matches.*;
import cw.members.MemberService;
import jakarta.persistence.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
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
    var state = em.find(ServiceState.class, 1);
    var rules =
        json.readValue(
            em.find(ScoringVersionEntity.class, state.desiredScoringVersion).rulesJson,
            ScoringRuleSet.class);
    var matches =
        em.createQuery(
                "select distinct m from MatchEntity m left join fetch m.participants where"
                    + " m.state='registered' order by m.id",
                MatchEntity.class)
            .getResultList();
    List<EvaluableMatch> games = new ArrayList<>();
    for (var m : matches) {
      var normalized = views.normalized(m);
      List<EvaluableParticipant> ps = new ArrayList<>();
      for (var p : m.participants) {
        var record =
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
