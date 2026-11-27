package cw.riot;

import cw.contracts.AccountContracts.RankSeedSnapshot;
import cw.contracts.EvaluationContracts.RankLookup;
import cw.riot.SoloRankService.Fetched;
import cw.riot.SoloRankService.Target;
import jakarta.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
    private final long deadlineMillis;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public LiveRankLookup(
            SoloRankService ranks,
            @Value("${cw.riot.lookup-deadline-ms:4000}") long deadlineMillis) {
        this.ranks = ranks;
        this.deadlineMillis = deadlineMillis;
    }

    /**
     * Returns one entry per member in the input order. Worker threads only call Riot; lookups that
     * finished before the deadline are saved here in one transaction, so a late or cancelled lookup
     * is never stored and cancellation never interrupts database work.
     */
    public List<RankLookup> lookup(List<String> memberIds) {
        List<Target> targets = memberIds.stream().map(ranks::target).toList();
        long end = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(deadlineMillis);
        List<Future<Fetched>> futures =
                targets.stream().map(t -> executor.submit(() -> ranks.fetch(t))).toList();
        List<Fetched> finished = new ArrayList<>();
        Map<String, String> failed = new HashMap<>();
        for (int i = 0; i < targets.size(); i++) {
            String id = targets.get(i).memberId();
            Future<Fetched> future = futures.get(i);
            try {
                finished.add(
                        future.get(Math.max(0, end - System.nanoTime()), TimeUnit.NANOSECONDS));
            } catch (TimeoutException error) {
                future.cancel(true);
                failed.put(id, "timeout");
            } catch (ExecutionException error) {
                failed.put(id, "unavailable");
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                future.cancel(true);
                failed.put(id, "timeout");
            }
        }
        Map<String, RankSeedSnapshot> saved = finished.isEmpty() ? Map.of() : ranks.save(finished);
        List<RankLookup> result = new ArrayList<>(memberIds.size());
        for (String id : memberIds) {
            RankSeedSnapshot value = saved.get(id);
            result.add(
                    value != null
                            ? RankLookup.of(id, value, value.status())
                            : RankLookup.of(id, ranks.snapshotForMember(id), failed.get(id)));
        }
        return List.copyOf(result);
    }

    @PreDestroy
    public void close() {
        executor.shutdownNow();
    }
}
