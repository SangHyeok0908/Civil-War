package cw.matches;
import cw.contracts.*;
import cw.contracts.MatchContracts.*;
import java.util.*;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
@Component
public class MatchViews {
    private final JsonMapper json;
    public MatchViews(JsonMapper json) { this.json=json; }
    public NormalizedMatch normalized(MatchEntity entity) { return json.readValue(entity.normalizedJson,NormalizedMatch.class); }
    public void requireParticipant(MatchEntity entity,CollectorPrincipal actor) {
        if(actor==null || entity.participants.stream().noneMatch(p->p.memberId.equals(actor.memberId()) && p.puuid.equals(actor.puuid())))
            throw new ApiException(403,"FORBIDDEN");
    }
    public CollectorMatch collector(MatchEntity entity) {
        Map<String,Role> roles=null;
        if(!entity.state.equals("pending")) {
            roles=new TreeMap<>(); for(var p:entity.participants) roles.put(p.puuid,p.role);
        }
        return new CollectorMatch(entity.id,entity.state,normalized(entity),roles);
    }
}
