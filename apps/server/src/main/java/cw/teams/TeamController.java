package cw.teams;

import cw.contracts.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
public class TeamController {
    private final TeamService teams;
    private final Clock clock;
    private final Map<String, List<Long>> requests = new LinkedHashMap<>();

    public TeamController(TeamService teams, Clock clock) {
        this.teams = teams;
        this.clock = clock;
    }

    public record Input(List<String> memberIds) {}

    @PostMapping("/api/teams/recommend")
    public Object recommend(@RequestBody Input input, HttpServletRequest req) {
        limit(req.getRemoteAddr());
        return teams.recommend(input.memberIds());
    }

    private synchronized void limit(String ip) {
        long cutoff = clock.millis() - 600_000;
        requests.values().forEach(v -> v.removeIf(t -> t <= cutoff));
        requests.entrySet().removeIf(e -> e.getValue().isEmpty());
        if (!requests.containsKey(ip) && requests.size() >= 10000)
            throw new ApiException(429, "RATE_LIMITED");
        var times = requests.computeIfAbsent(ip, k -> new ArrayList<>());
        if (times.size() >= 60) throw new ApiException(429, "RATE_LIMITED");
        times.add(clock.millis());
    }
}
