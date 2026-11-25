package cw.riot;

import cw.contracts.AccountContracts.RankSeedSnapshot;
import cw.contracts.EvaluationContracts.RankLookup;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Looks up the selected members' solo ranks at once and stops waiting at a fixed deadline. */
@Component
public class LiveRankLookup {
    private final SoloRankService ranks;
    private final Clock clock;
    private final long deadlineMillis;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public LiveRankLookup(
            SoloRankService ranks,
            Clock clock,
            @Value("${cw.riot.lookup-deadline-ms:4000}") long deadlineMillis) {
        this.ranks = ranks;
        this.clock = clock;
        this.deadlineMillis = deadlineMillis;
    }

    /** Returns one entry per member in the input order. */
    public List<RankLookup> lookup(List<String> memberIds) {
        Instant deadline = clock.instant().plusMillis(deadlineMillis);
        long end = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(deadlineMillis);
        List<Future<RankLookup>> futures =
                memberIds.stream()
                        .map(id -> executor.submit(() -> lookupOne(id, deadline)))
                        .toList();
        List<RankLookup> result = new ArrayList<>(memberIds.size());
        for (int i = 0; i < memberIds.size(); i++) {
            String id = memberIds.get(i);
            Future<RankLookup> future = futures.get(i);
            try {
                result.add(future.get(Math.max(0, end - System.nanoTime()), TimeUnit.NANOSECONDS));
            } catch (TimeoutException error) {
                future.cancel(true);
                result.add(RankLookup.of(id, ranks.snapshotForMember(id), "timeout"));
            } catch (ExecutionException error) {
                result.add(RankLookup.of(id, ranks.snapshotForMember(id), "unavailable"));
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                future.cancel(true);
                result.add(RankLookup.of(id, ranks.snapshotForMember(id), "timeout"));
            }
        }
        return List.copyOf(result);
    }

    private RankLookup lookupOne(String memberId, Instant deadline) {
        RankSeedSnapshot value = ranks.refresh(memberId, deadline);
        return value == null
                ? RankLookup.of(memberId, ranks.snapshotForMember(memberId), "timeout")
                : RankLookup.of(memberId, value, value.status());
    }

    @PreDestroy
    public void close() {
        executor.shutdownNow();
    }
}
