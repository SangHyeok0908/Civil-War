package cw.auth;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class GroupCodeController {
    private final GroupCodeService codes;

    public GroupCodeController(GroupCodeService codes) {
        this.codes = codes;
    }

    @GetMapping("/api/admin/collector-code")
    public Object status() {
        return codes.status();
    }

    @PostMapping("/api/admin/collector-code")
    public Object issue() {
        return codes.issue();
    }

    @PostMapping("/api/admin/collector-code/rotate")
    public Object rotate() {
        return codes.rotate();
    }

    @DeleteMapping("/api/admin/collector-code")
    public ResponseEntity<?> delete() {
        codes.delete();
        return ResponseEntity.noContent().build();
    }
}
