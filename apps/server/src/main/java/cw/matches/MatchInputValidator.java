package cw.matches;
import cw.contracts.*;
import cw.contracts.MatchContracts.*;
import cw.lcu.MatchNormalizer;
import java.util.*;
import org.springframework.stereotype.Component;
@Component
public class MatchInputValidator {
    private final MatchNormalizer normalizer;
    public MatchInputValidator(MatchNormalizer normalizer) { this.normalizer=normalizer; }
    public ValidationResult validateIngest(IngestMatchInput input) {
        try { normalize(input); return new ValidationResult(true,List.of()); }
        catch(ApiException e) { return new ValidationResult(false,e.details.isEmpty()?List.of(new Issue("schemaVersion",e.code)):e.details); }
    }
    public NormalizedMatch normalize(IngestMatchInput input) {
        if(input==null || input.schemaVersion()!=1) throw new ApiException(422,"UNSUPPORTED_SCHEMA");
        submission(input.clientSubmissionId()); return normalizer.normalizeMatch(input.rawMatch());
    }
    public ValidationResult validateConfirmation(ConfirmationInput input,NormalizedMatch match) {
        try { requireRoles(input,match); return new ValidationResult(true,List.of()); }
        catch(ApiException e) { return new ValidationResult(false,e.details); }
    }
    public void requireRoles(ConfirmationInput input,NormalizedMatch match) {
        submission(input.clientSubmissionId());
        if(!match.matchKey().equals(input.matchKey()) || input.rolesByPuuid()==null || input.rolesByPuuid().size()!=10)
            throw invalidRoles();
        Map<Integer,Set<Role>> teams=new HashMap<>();
        for(var p:match.participants()) {
            Role role=input.rolesByPuuid().get(p.puuid());
            if(role==null || !teams.computeIfAbsent(p.teamId(),k->new HashSet<>()).add(role)) throw invalidRoles();
        }
    }
    public static void submission(String id) { if(id==null || id.isBlank() || id.length()>100) throw new ApiException(422,"INVALID_MATCH",List.of(new Issue("clientSubmissionId","REQUIRED"))); }
    private static ApiException invalidRoles() { return new ApiException(422,"INVALID_MATCH",List.of(new Issue("rolesByPuuid","INVALID_ROLES"))); }
}
