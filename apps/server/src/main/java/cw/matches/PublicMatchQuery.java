package cw.matches;

import cw.contracts.ApiException;
import cw.contracts.EvaluationContracts.GameScore;
import cw.contracts.MatchContracts.ParticipantRecord;
import cw.contracts.Role;
import cw.db.ServiceState;
import cw.evaluation.EvaluationRepository;
import cw.members.MemberRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class PublicMatchQuery {
    private final MatchRepository matches;
    private final MemberRepository members;
    private final MatchViews views;
    private final EvaluationRepository evaluations;
    @PersistenceContext private EntityManager entityManager;

    public PublicMatchQuery(
            MatchRepository matches,
            MemberRepository members,
            MatchViews views,
            EvaluationRepository evaluations) {
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
            List<GameScore> scores) {}

    public record MatchPage(List<PublicMatch> items, String nextCursor) {}

    public PublicMatch get(String key) {
        var entity =
                matches.findById(key)
                        .filter(match -> match.state.equals("registered"))
                        .orElseThrow(() -> new ApiException(404, "NOT_FOUND"));
        return view(entity);
    }

    public MatchPage list(MatchSpecifications.Filters filters, String cursor, int limit) {
        if (limit < 1
                || limit > 100
                || (filters.championId() != null && filters.championId() < 1)) {
            throw new ApiException(400, "INVALID_FILTER");
        }
        var rows =
                matches.findAll(
                                MatchSpecifications.registered(filters, decodeCursor(cursor)),
                                PageRequest.of(
                                        0,
                                        limit + 1,
                                        Sort.by(Sort.Direction.DESC, "startedAt", "id")))
                        .getContent();
        boolean hasNextPage = rows.size() > limit;
        var pageMatches = rows.subList(0, Math.min(limit, rows.size()));
        return new MatchPage(
                pageMatches.stream().map(this::view).toList(),
                hasNextPage ? encodeCursor(pageMatches.getLast()) : null);
    }

    public PublicMatch view(MatchEntity entity) {
        var normalized = views.normalized(entity);
        Map<String, MatchParticipantEntity> participantsByPuuid = new HashMap<>();
        for (var participant : entity.participants) {
            participantsByPuuid.put(participant.puuid, participant);
        }
        var participants =
                normalized.participants().stream()
                        .map(
                                record ->
                                        participantView(
                                                record, participantsByPuuid.get(record.puuid())))
                        .toList();
        var state = entityManager.find(ServiceState.class, 1);
        var generation = evaluations.current();
        var gameScores =
                generation == null
                        ? List.<GameScore>of()
                        : generation.gameScores().stream()
                                .filter(gameScore -> gameScore.matchKey().equals(entity.id))
                                .toList();
        return new PublicMatch(
                entity.id,
                normalized.startedAtUtc(),
                normalized.durationSeconds(),
                normalized.mapId(),
                normalized.patch(),
                participants,
                generation == null ? "recalculating" : "ready",
                generation == null ? null : generation.scoringVersion(),
                state.sourceRevision,
                generation == null ? null : generation.id(),
                gameScores);
    }

    private PublicParticipant participantView(
            ParticipantRecord record, MatchParticipantEntity stored) {
        var member = members.findById(stored.memberId).orElseThrow();
        return new PublicParticipant(
                member.id,
                member.displayName,
                record.teamId(),
                record.win(),
                record.championId(),
                stored.role,
                record.kills(),
                record.deaths(),
                record.assists(),
                record.championDamage(),
                record.damageTaken(),
                record.laneCs(),
                record.neutralCs(),
                record.goldEarned(),
                record.visionScore(),
                record.objectiveDamage(),
                record.turretDamage(),
                record.items());
    }

    private static String encodeCursor(MatchEntity entity) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(
                        (entity.startedAt.toString() + "|" + entity.id)
                                .getBytes(StandardCharsets.UTF_8));
    }

    private static MatchSpecifications.Cursor decodeCursor(String cursor) {
        if (cursor == null) {
            return null;
        }
        try {
            if (cursor.length() > 300) {
                throw new IllegalArgumentException();
            }
            var cursorParts =
                    new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8)
                            .split("\\|", -1);
            if (cursorParts.length != 2 || !cursorParts[1].matches("[A-Z0-9]{1,16}:[0-9]{1,30}")) {
                throw new IllegalArgumentException();
            }
            return new MatchSpecifications.Cursor(Instant.parse(cursorParts[0]), cursorParts[1]);
        } catch (RuntimeException e) {
            throw new ApiException(400, "INVALID_CURSOR");
        }
    }
}
