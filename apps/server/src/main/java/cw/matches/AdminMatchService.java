package cw.matches;

import cw.contracts.ApiException;
import cw.contracts.MatchContracts.ConfirmationInput;
import cw.contracts.Role;
import cw.db.AuditEntry;
import cw.db.MutationCoordinator;
import cw.db.ServiceState;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Service
@Transactional(readOnly = true)
public class AdminMatchService {
    private final MatchRepository matches;
    private final MatchViews views;
    private final MatchInputValidator validator;
    private final MutationCoordinator mutations;
    private final JsonMapper json;
    @PersistenceContext private EntityManager em;

    public AdminMatchService(
            MatchRepository matches,
            MatchViews views,
            MatchInputValidator validator,
            MutationCoordinator mutations,
            JsonMapper json) {
        this.matches = matches;
        this.views = views;
        this.validator = validator;
        this.mutations = mutations;
        this.json = json;
    }

    @Transactional
    public Map<String, Object> roles(String key, Map<String, Role> roles) {
        ServiceState state = mutations.lock();
        MatchEntity match = find(key);

        if (!match.state.equals("registered")) {
            throw new ApiException(
                    409, match.state.equals("canceled") ? "MATCH_CANCELED" : "INVALID_STATE");
        }

        validator.requireRoles(
                new ConfirmationInput(key, roles, "admin-correction"), views.normalized(match));

        if (match.participants.stream().anyMatch(p -> p.role != roles.get(p.puuid))) {
            Map<String, Role> before = roleAudit(match);

            for (MatchParticipantEntity p : match.participants) {
                p.role = roles.get(p.puuid);
            }

            mutations.changed(state);
            mutations.audit(
                    "roles_corrected",
                    "owner",
                    key,
                    json.writeValueAsString(Map.of("before", before, "after", roleAudit(match))));
        }

        return Map.of(
                "matchKey", key, "state", match.state, "sourceRevision", state.sourceRevision);
    }

    @Transactional
    public Map<String, Object> cancel(String key) {
        ServiceState state = mutations.lock();
        MatchEntity match = find(key);

        if (match.state.equals("pending")) {
            throw new ApiException(409, "INVALID_STATE");
        }

        if (!match.state.equals("canceled")) {
            match.state = "canceled";

            mutations.changed(state);
            mutations.audit("match_canceled", "owner", key, "{}");
        }

        return Map.of(
                "matchKey", key, "state", match.state, "sourceRevision", state.sourceRevision);
    }

    public Object detail(String key) {
        MatchEntity m = find(key);
        List<Map<String, Object>> history =
                em
                        .createQuery(
                                "select a from AuditEntry a where a.targetId=:key order by a.createdAt,a.id",
                                AuditEntry.class)
                        .setParameter("key", key)
                        .getResultList()
                        .stream()
                        .map(
                                a ->
                                        Map.of(
                                                "id",
                                                a.id,
                                                "action",
                                                a.action,
                                                "actorId",
                                                a.actorId,
                                                "createdAt",
                                                a.createdAt,
                                                "details",
                                                json.readTree(a.details)))
                        .toList();

        return Map.of(
                "record",
                views.collector(m),
                "rawMatch",
                json.readTree(m.rawJson),
                "rawJson",
                m.rawJson,
                "audit",
                history);
    }

    public Object list(String state) {
        if (!Set.of("pending", "registered", "canceled").contains(state)) {
            throw new ApiException(400, "INVALID_FILTER");
        }

        return matches.findByStateOrderByStartedAtDescIdDesc(state).stream()
                .map(views::collector)
                .toList();
    }

    private MatchEntity find(String key) {
        return matches.findById(key).orElseThrow(() -> new ApiException(404, "NOT_FOUND"));
    }

    private Map<String, Role> roleAudit(MatchEntity match) {
        Map<String, Role> result = new TreeMap<>();

        for (MatchParticipantEntity p : match.participants) {
            result.put(p.memberId, p.role);
        }

        return result;
    }
}
