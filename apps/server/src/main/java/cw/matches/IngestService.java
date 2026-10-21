package cw.matches;
import cw.contracts.*;
import cw.contracts.MatchContracts.*;
import cw.db.MutationCoordinator;
import cw.members.*;
import java.time.Clock;
import java.util.*;
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
    public IngestService(MatchInputValidator validator,MatchRepository matches,MemberRepository members,
            MutationCoordinator mutations,MatchViews views,JsonMapper json,Clock clock) {
        this.validator=validator; this.matches=matches; this.members=members; this.mutations=mutations; this.views=views; this.json=json; this.clock=clock;
    }
    @Transactional
    public IngestMatchAck ingestMatch(IngestMatchInput input,CollectorPrincipal actor) {
        var normalized=validator.normalize(input);
        mutations.lock();
        var existing=matches.findById(normalized.matchKey());
        if(existing.isPresent()) {
            views.requireParticipant(existing.get(),actor);
            return new IngestMatchAck(existing.get().id,existing.get().state,"already_"+existing.get().state);
        }
        var entity=new MatchEntity(); entity.id=normalized.matchKey(); entity.platformId=normalized.platformId(); entity.gameId=normalized.gameId();
        entity.state="pending"; entity.startedAt=normalized.startedAtUtc(); entity.createdAt=clock.instant();
        entity.rawJson=json.writeValueAsString(input.rawMatch()); entity.normalizedJson=json.writeValueAsString(normalized);
        for(var record:normalized.participants()) {
            var member=members.findByPuuid(record.puuid()).orElseThrow(()->new ApiException(422,"UNREGISTERED_PARTICIPANT"));
            var p=new MatchParticipantEntity(); p.id=UUID.randomUUID().toString(); p.match=entity; p.memberId=member.id;
            p.puuid=record.puuid(); p.teamId=record.teamId(); p.championId=record.championId(); p.win=record.win(); entity.participants.add(p);
        }
        views.requireParticipant(entity,actor);
        matches.save(entity);
        mutations.audit("match_ingested",actor.memberId(),entity.id,"{}");
        return new IngestMatchAck(entity.id,entity.state,"created_pending");
    }
}
