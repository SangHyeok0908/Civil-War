package cw.matches;

import cw.contracts.*;
import cw.contracts.MatchContracts.*;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CollectorMatchQuery {
    private final MatchRepository matches;
    private final MatchViews views;

    public CollectorMatchQuery(MatchRepository matches, MatchViews views) {
        this.matches = matches;
        this.views = views;
    }

    public CollectorMatch getCollectorMatch(String key, CollectorPrincipal actor) {
        var entity = matches.findById(key).orElseThrow(() -> new ApiException(404, "NOT_FOUND"));
        views.requireParticipant(entity, actor);
        return views.collector(entity);
    }

    public List<CollectorMatch> list(String state, CollectorPrincipal actor) {
        if (!List.of("pending", "registered", "canceled").contains(state))
            throw new ApiException(400, "INVALID_FILTER");
        return matches
                .findAll(
                        (root, query, cb) -> {
                            var p = root.join("participants");
                            return cb.and(
                                    cb.equal(root.get("state"), state),
                                    cb.equal(p.get("memberId"), actor.memberId()),
                                    cb.equal(p.get("puuid"), actor.puuid()));
                        },
                        org.springframework.data.domain.Sort.by(
                                org.springframework.data.domain.Sort.Direction.DESC,
                                "startedAt",
                                "id"))
                .stream()
                .map(views::collector)
                .toList();
    }
}
