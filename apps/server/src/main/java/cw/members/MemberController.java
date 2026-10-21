package cw.members;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;
@RestController
public class MemberController {
    private final MemberService members;
    public MemberController(MemberService members) { this.members=members; }
    @GetMapping("/api/members") public Object publicList() { return members.publicList(); }
    @GetMapping({"/api/admin/members","/api/collector/members"}) public Object internalList() { return members.list(); }
    @GetMapping("/api/admin/members/{id}") public Object get(@PathVariable String id) { return members.get(id); }
    @PostMapping("/api/admin/members") public Object create(@RequestBody JsonNode input) { return members.create(input); }
    @PatchMapping("/api/admin/members/{id}") public Object patch(@PathVariable String id,@RequestBody JsonNode input) { return members.patch(id,input); }
}
