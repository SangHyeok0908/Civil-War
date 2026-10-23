package cw.matches;

import cw.contracts.*;
import cw.db.ServiceState;
import cw.members.*;
import jakarta.persistence.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(
        readOnly = true,
        isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
public class PublicMatchQuery {
    private final MatchRepository matches;
    private final MemberRepository members;
    private final MatchViews views;
    private final cw.evaluation.EvaluationRepository evaluations;
    @PersistenceContext private EntityManager em;

    public PublicMatchQuery(
            MatchRepository matches,
            MemberRepository members,
            MatchViews views,
            cw.evaluation.EvaluationRepository evaluations) {
        this.matches = matches;
        this.members = members;
        this.views = views;
        this.evaluations = evaluations;
    }

    public record PublicParticipant(
            String memberId,
            String displayName,
            int teamId,
            boolean win,
            int championId,
            Role role,
            long kills,
            long deaths,
            long assists,
            long championDamage,
            long damageTaken,
            long laneCs,
            long neutralCs,
            long goldEarned,
            long visionScore,
            long objectiveDamage,
            long turretDamage,
            List<Long> items) {}

    public record PublicMatch(
            String matchKey,
            Instant startedAtUtc,
            long durationSeconds,
            int mapId,
            String patch,
            List<PublicParticipant> participants,
            String evaluationStatus,
            String scoringVersion,
            long sourceRevision,
            String generationId,
            List<cw.contracts.EvaluationContracts.GameScore> scores) {}

    public record MatchPage(List<PublicMatch> items, String nextCursor) {}

    public PublicMatch get(String key) {
        var entity =
                matches.findById(key)
                        .filter(m -> m.state.equals("registered"))
                        .orElseThrow(() -> new ApiException(404, "NOT_FOUND"));
        return view(entity);
    }

    public MatchPage list(MatchSpecifications.Filters filters, String cursor, int limit) {
        if (limit < 1 || limit > 100 || (filters.championId() != null && filters.championId() < 1))
            throw new ApiException(400, "INVALID_FILTER");
        var rows =
                matches.findAll(
                                MatchSpecifications.registered(filters, decode(cursor)),
                                PageRequest.of(
                                        0,
                                        limit + 1,
                                        Sort.by(Sort.Direction.DESC, "startedAt", "id")))
                        .getContent();
        boolean more = rows.size() > limit;
        var selected = rows.subList(0, Math.min(limit, rows.size()));
        return new MatchPage(
                selected.stream().map(this::view).toList(),
                more ? encode(selected.getLast()) : null);
    }

    public PublicMatch view(MatchEntity entity) {
        var normalized = views.normalized(entity);
        Map<String, MatchParticipantEntity> participants = new HashMap<>();
        for (var p : entity.participants) participants.put(p.puuid, p);
        var rows =
                normalized.participants().stream()
                        .map(
                                p -> {
                                    var stored = participants.get(p.puuid());
                                    var member = members.findById(stored.memberId).orElseThrow();
                                    return new PublicParticipant(
                                            member.id,
                                            member.displayName,
                                            p.teamId(),
                                            p.win(),
                                            p.championId(),
                                            stored.role,
                                            p.kills(),
                                            p.deaths(),
                                            p.assists(),
                                            p.championDamage(),
                                            p.damageTaken(),
                                            p.laneCs(),
                                            p.neutralCs(),
                                            p.goldEarned(),
                                            p.visionScore(),
                                            p.objectiveDamage(),
                                            p.turretDamage(),
                                            p.items());
                                })
                        .toList();
        var state = em.find(ServiceState.class, 1);
        var generation = evaluations.current();
        return new PublicMatch(
                entity.id,
                normalized.startedAtUtc(),
                normalized.durationSeconds(),
                normalized.mapId(),
                normalized.patch(),
                rows,
                generation == null ? "recalculating" : "ready",
                generation == null ? null : generation.scoringVersion(),
                state.sourceRevision,
                generation == null ? null : generation.id(),
                generation == null
                        ? List.of()
                        : generation.gameScores().stream()
                                .filter(s -> s.matchKey().equals(entity.id))
                                .toList());
    }

    private static String encode(MatchEntity entity) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(
                        (entity.startedAt.toString() + "|" + entity.id)
                                .getBytes(StandardCharsets.UTF_8));
    }

    private static MatchSpecifications.Cursor decode(String cursor) {
        if (cursor == null) return null;
        try {
            if (cursor.length() > 300) throw new IllegalArgumentException();
            var split =
                    new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8)
                            .split("\\|", -1);
            if (split.length != 2 || !split[1].matches("[A-Z0-9]{1,16}:[0-9]{1,30}"))
                throw new IllegalArgumentException();
            return new MatchSpecifications.Cursor(Instant.parse(split[0]), split[1]);
        } catch (RuntimeException e) {
            throw new ApiException(400, "INVALID_CURSOR");
        }
    }
}
