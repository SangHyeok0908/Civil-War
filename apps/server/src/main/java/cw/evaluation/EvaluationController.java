package cw.evaluation;

import cw.contracts.EvaluationContracts.ScoringRuleSet;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class EvaluationController {
    private final EvaluationRepository evaluations;

    public EvaluationController(EvaluationRepository evaluations) {
        this.evaluations = evaluations;
    }

    @GetMapping("/api/scoring-versions/{id}")
    public Object rule(@PathVariable String id) {
        return evaluations.rule(id);
    }

    @GetMapping("/api/rankings")
    public Object rankings() {
        return evaluations.rankings();
    }

    @GetMapping("/api/members/{id}/stats")
    public Object stats(@PathVariable String id) {
        return evaluations.stats(id);
    }

    @GetMapping("/api/admin/scoring-versions")
    public Object rules() {
        return evaluations.rules();
    }

    @PostMapping("/api/admin/scoring-versions")
    public Object rules(@RequestBody ScoringRuleSet input) {
        return evaluations.createRules(input);
    }

    @GetMapping("/api/admin/recalculation/jobs")
    public Object jobs() {
        return evaluations.jobs();
    }

    @PostMapping("/api/admin/recalculation/retry")
    public Object retry() {
        evaluations.retry();
        return Map.of("status", "pending");
    }
}
