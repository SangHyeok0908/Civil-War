package cw.evaluation;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.ApiException;
import cw.matches.AdminMatchService;
import cw.support.DatabaseTestSupport;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class CollectorProgressIntegrationTest extends DatabaseTestSupport {
    @Autowired CollectorProgressQuery progress;
    @Autowired RecalculationWorker worker;
    @Autowired EvaluationRepository evaluations;
    @Autowired AdminMatchService admin;

    String status() {
        return progress.get(List.of(KEY), actor(1)).getFirst().evaluation().status();
    }

    @Test
    void liveWorkerLockAllowsRunning() throws Exception {
        registered();
        evaluations.claim(false);
        try (var connection = jdbc.getDataSource().getConnection();
                var statement = connection.createStatement()) {
            statement.execute("select pg_advisory_lock(731954801)");
            try {
                assertThat(status()).isEqualTo("running");
            } finally {
                statement.execute("select pg_advisory_unlock(731954801)");
            }
        }
    }

    @Test
    void olderSuccessIsNotCurrentReady() {
        registered();
        assertThat(status()).isEqualTo("queued");
        worker.runOnce();
        assertThat(status()).isEqualTo("ready");
        admin.roles(KEY, roles(true));
        assertThat(status()).isEqualTo("queued");
        worker.runOnce();
        assertThat(status()).isEqualTo("ready");
    }

    @Test
    void calculationFailureKeepsRegistered() {
        registered();
        evaluations.claim(false);
        jdbc.update("update recalculation_jobs set status='failed'");
        assertThat(status()).isEqualTo("failed");
        assertThat(matches.findById(KEY).orElseThrow().state).isEqualTo("registered");
    }

    @Test
    void progressRequiresParticipant() {
        registered();
        assertThatThrownBy(() -> progress.get(List.of(KEY), actor(11)))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void workerDisappearedIsNotForeverRunning() {
        registered();
        evaluations.claim(false);
        assertThat(status()).isEqualTo("unknown");
    }
}
