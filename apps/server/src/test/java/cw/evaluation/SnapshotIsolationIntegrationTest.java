package cw.evaluation;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import cw.matches.*;
import cw.members.MemberService;
import cw.support.DatabaseTestSupport;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

class SnapshotIsolationIntegrationTest extends DatabaseTestSupport {
    @Autowired EvaluationSnapshot snapshot;
    @Autowired RecalculationWorker worker;
    @Autowired AdminMatchService admin;
    @Autowired MemberService memberService;
    @MockitoSpyBean MatchViews views;

    @Test
    void repeatableReadInputSnapshotSurvivesConcurrentMutations() {
        registered();
        worker.runOnce();
        long before = revision();
        var fired = new java.util.concurrent.atomic.AtomicBoolean();
        doAnswer(
                        invocation -> {
                            if (fired.compareAndSet(false, true))
                                try (var executor = Executors.newSingleThreadExecutor()) {
                                    executor.submit(
                                                    () -> {
                                                        memberService.patch(
                                                                "member-1",
                                                                json.readTree(
                                                                        "{\"seedSkill\":99}"));
                                                        admin.roles(KEY, roles(true));
                                                        admin.cancel(KEY);
                                                    })
                                            .get(10, TimeUnit.SECONDS);
                                }
                            return invocation.callRealMethod();
                        })
                .when(views)
                .normalized(any(MatchEntity.class));
        var input = snapshot.capture();
        assertThat(input.sourceRevision()).isEqualTo(before);
        assertThat(input.matches()).hasSize(1);
        assertThat(
                        input.members().stream()
                                .filter(m -> m.id().equals("member-1"))
                                .findFirst()
                                .orElseThrow()
                                .seedSkill())
                .isEqualTo(50);
        assertThat(
                        input.matches().getFirst().participants().stream()
                                .filter(p -> p.memberId().equals("member-1"))
                                .findFirst()
                                .orElseThrow()
                                .role())
                .isEqualTo(cw.contracts.Role.TOP);
        assertThat(revision()).isEqualTo(before + 3);
    }
}
