package cw.evaluation;

import cw.contracts.MatchContracts.CollectorPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.web.bind.annotation.*;

@RestController
public class CollectorProgressController {
    private final CollectorProgressQuery query;

    public CollectorProgressController(CollectorProgressQuery query) {
        this.query = query;
    }

    public record Input(List<String> matchKeys) {}

    @PostMapping("/api/collector/progress")
    public Object progress(@RequestBody Input input, HttpServletRequest request) {
        return query.get(input.matchKeys(), (CollectorPrincipal) request.getAttribute("collector"));
    }
}
