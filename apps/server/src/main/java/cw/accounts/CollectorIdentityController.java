package cw.accounts;

import cw.auth.GroupCodeService;
import cw.contracts.AccountContracts.IdentityObservation;
import cw.contracts.ApiException;
import cw.contracts.MatchContracts.*;
import cw.db.MutationCoordinator;
import cw.matches.MatchInputValidator;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
public class CollectorIdentityController {
    private final AccountLinkService links;
    private final MatchInputValidator validator;
    private final MutationCoordinator mutations;
    private final GroupCodeService groups;

    public CollectorIdentityController(
            AccountLinkService links,
            MatchInputValidator validator,
            MutationCoordinator mutations,
            GroupCodeService groups) {
        this.links = links;
        this.validator = validator;
        this.mutations = mutations;
        this.groups = groups;
    }

    public record Observations(JsonNode rawMatch, List<IdentityObservation> observations) {}

    @PostMapping("/api/collector/accounts/observations")
    @Transactional
    public Object observe(@RequestBody Observations input, HttpServletRequest req) {
        var actor = (CollectorPrincipal) req.getAttribute("collector");
        var match =
                validator.normalize(new IngestMatchInput(input.rawMatch(), "identity-check", 1));
        mutations.lock();
        groups.requireCurrentGeneration(actor);
        if (match.participants().stream().noneMatch(p -> p.puuid().equals(actor.puuid())))
            throw new ApiException(403, "FORBIDDEN");
        if (input.observations() == null || input.observations().size() > 10)
            throw new ApiException(422, "INVALID_REQUEST");
        for (var o : input.observations()) {
            if (o == null
                    || !"current_lookup".equals(o.source())
                    || match.participants().stream().noneMatch(p -> p.puuid().equals(o.puuid())))
                throw new ApiException(422, "ACCOUNT_EVIDENCE_REQUIRED");
            links.observe(o);
        }
        return Map.of("observed", input.observations().size());
    }
}
