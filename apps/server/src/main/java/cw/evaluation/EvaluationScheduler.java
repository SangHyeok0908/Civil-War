package cw.evaluation;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration
@EnableScheduling
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnProperty(name = "cw.evaluation.enabled", havingValue = "true", matchIfMissing = true)
public class EvaluationScheduler {
    private final RecalculationWorker worker;
    private boolean first = true;

    public EvaluationScheduler(RecalculationWorker worker) {
        this.worker = worker;
    }

    @Scheduled(
            fixedDelayString = "${cw.evaluation.poll-ms:1000}",
            initialDelayString = "${cw.evaluation.initial-delay-ms:1000}")
    public void tick() {
        if (worker.runOnce(first)) {
            first = false;
        }
    }
}
