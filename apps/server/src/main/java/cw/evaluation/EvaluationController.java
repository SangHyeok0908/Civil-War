package cw.evaluation;

import cw.contracts.EvaluationContracts.ScoringRuleSet;
import org.springframework.web.bind.annotation.*;

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
        return java.util.Map.of("status", "pending");
    }
}
