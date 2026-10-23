package cw.matches;

import cw.contracts.Role;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
public class MatchController {
    private final PublicMatchQuery publicQuery;
    private final AdminMatchService admin;

    public MatchController(PublicMatchQuery publicQuery, AdminMatchService admin) {
        this.publicQuery = publicQuery;
        this.admin = admin;
    }

    public record RolesInput(Map<String, Role> rolesByPuuid) {}

    @GetMapping("/api/matches")
    public Object list(
            @RequestParam(required = false) String memberId,
            @RequestParam(required = false) Integer championId,
            @RequestParam(required = false) Role role,
            @RequestParam(required = false) Boolean win,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") int limit) {
        return publicQuery.list(
                new MatchSpecifications.Filters(memberId, championId, role, win), cursor, limit);
    }

    @GetMapping("/api/members/{id}/matches")
    public Object memberMatches(
            @PathVariable String id,
            @RequestParam(required = false) Integer championId,
            @RequestParam(required = false) Role role,
            @RequestParam(required = false) Boolean win,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") int limit) {
        return publicQuery.list(
                new MatchSpecifications.Filters(id, championId, role, win), cursor, limit);
    }

    @GetMapping("/api/matches/{key}")
    public Object detail(@PathVariable String key) {
        return publicQuery.get(key);
    }

    @GetMapping("/api/admin/matches")
    public Object internalList(@RequestParam(defaultValue = "pending") String state) {
        return admin.list(state);
    }

    @GetMapping("/api/admin/matches/{key}")
    public Object internalDetail(@PathVariable String key) {
        return admin.detail(key);
    }

    @PatchMapping("/api/admin/matches/{key}/roles")
    public Object roles(@PathVariable String key, @RequestBody RolesInput input) {
        return admin.roles(key, input.rolesByPuuid());
    }

    @PostMapping("/api/admin/matches/{key}/cancel")
    public Object cancel(@PathVariable String key) {
        return admin.cancel(key);
    }
}
