package cw.matches;

import cw.contracts.*;
import cw.contracts.MatchContracts.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/collector/matches")
public class CollectorMatchController {
    private final IngestService ingest;
    private final RegistrationService registration;
    private final CollectorMatchQuery query;

    public CollectorMatchController(
            IngestService ingest, RegistrationService registration, CollectorMatchQuery query) {
        this.ingest = ingest;
        this.registration = registration;
        this.query = query;
    }

    public record ConfirmBody(Map<String, Role> rolesByPuuid, String clientSubmissionId) {}

    @PostMapping("/ingest")
    public IngestMatchAck ingest(@RequestBody IngestMatchInput input, HttpServletRequest req) {
        return ingest.ingestMatch(input, actor(req));
    }

    @GetMapping
    public Object list(
            @RequestParam(defaultValue = "pending") String state, HttpServletRequest req) {
        return query.list(state, actor(req));
    }

    @GetMapping("/{key}")
    public CollectorMatch get(@PathVariable String key, HttpServletRequest req) {
        return query.getCollectorMatch(key, actor(req));
    }

    @PostMapping("/{key}/confirm")
    public RegistrationAck confirm(
            @PathVariable String key, @RequestBody ConfirmBody input, HttpServletRequest req) {
        return registration.registerMatch(
                new ConfirmationInput(key, input.rolesByPuuid(), input.clientSubmissionId()),
                actor(req));
    }

    private CollectorPrincipal actor(HttpServletRequest request) {
        return (CollectorPrincipal) request.getAttribute("collector");
    }
}
