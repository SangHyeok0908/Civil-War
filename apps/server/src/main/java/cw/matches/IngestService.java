package cw.matches;

import cw.contracts.ApiException;
import cw.contracts.MatchContracts.CollectorPrincipal;
import cw.contracts.MatchContracts.IngestMatchAck;
import cw.contracts.MatchContracts.IngestMatchInput;
import cw.contracts.MatchContracts.NormalizedMatch;
import cw.contracts.MatchContracts.ParticipantRecord;
import cw.db.MutationCoordinator;
import cw.members.MemberRepository;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Service
public class IngestService {
    private final MatchInputValidator validator;
    private final MatchRepository matches;
    private final MemberRepository members;
    private final MutationCoordinator mutations;
    private final MatchViews views;
    private final JsonMapper json;
    private final Clock clock;

    public IngestService(
            MatchInputValidator validator,
            MatchRepository matches,
            MemberRepository members,
            MutationCoordinator mutations,
            MatchViews views,
            JsonMapper json,
            Clock clock) {
        this.validator = validator;
        this.matches = matches;
        this.members = members;
        this.mutations = mutations;
        this.views = views;
        this.json = json;
        this.clock = clock;
    }

    @Transactional
    public IngestMatchAck ingestMatch(IngestMatchInput input, CollectorPrincipal actor) {
        var normalized = validator.normalize(input);
        mutations.lock();
        var existing = matches.findById(normalized.matchKey());
        if (existing.isPresent()) {
            views.requireParticipant(existing.get(), actor);
            return new IngestMatchAck(
                    existing.get().id, existing.get().state, "already_" + existing.get().state);
        }
        var match = createPendingMatch(input, normalized);
        views.requireParticipant(match, actor);
        matches.save(match);
        mutations.audit("match_ingested", actor.memberId(), match.id, "{}");
        return new IngestMatchAck(match.id, match.state, "created_pending");
    }

    private MatchEntity createPendingMatch(IngestMatchInput input, NormalizedMatch normalized) {
        var match = new MatchEntity();
        match.id = normalized.matchKey();
        match.platformId = normalized.platformId();
        match.gameId = normalized.gameId();
        match.state = "pending";
        match.startedAt = normalized.startedAtUtc();
        match.createdAt = clock.instant();
        match.rawJson = json.writeValueAsString(input.rawMatch());
        match.normalizedJson = json.writeValueAsString(normalized);
        for (var record : normalized.participants()) {
            match.participants.add(createParticipant(record, match));
        }
        return match;
    }

    private MatchParticipantEntity createParticipant(ParticipantRecord record, MatchEntity match) {
        var member =
                members.findByPuuid(record.puuid())
                        .orElseThrow(() -> new ApiException(422, "UNREGISTERED_PARTICIPANT"));
        var participant = new MatchParticipantEntity();
        participant.id = UUID.randomUUID().toString();
        participant.match = match;
        participant.memberId = member.id;
        participant.puuid = record.puuid();
        participant.teamId = record.teamId();
        participant.championId = record.championId();
        participant.win = record.win();
        return participant;
    }
}
