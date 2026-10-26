package cw.auth;

import cw.auth.AuthService.AdminPrincipal;
import cw.auth.AuthService.EnrollmentReply;
import cw.contracts.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthController {
    private final AuthService auth;
    private final ApiSecurityFilter security;
    private final AuthRateLimiter limiter;

    public AuthController(AuthService auth, ApiSecurityFilter security, AuthRateLimiter limiter) {
        this.auth = auth;
        this.security = security;
        this.limiter = limiter;
    }

    public record CodeInput(String code) {}

    public record EnrollmentInput(String code, String currentPuuid) {}

    public record IssueCodeInput(String scope, String memberId) {}

    @PostMapping("/api/admin/session")
    public ResponseEntity<?> login(@RequestBody CodeInput input, HttpServletRequest req) {
        limiter.check(req.getRemoteAddr());

        AuthService.LoginReply reply;

        try {
            reply = auth.login(input.code());
        } catch (ApiException e) {
            limiter.failed(req.getRemoteAddr());
            throw e;
        }

        limiter.succeeded(req.getRemoteAddr());

        return ResponseEntity.ok()
                .header(
                        HttpHeaders.SET_COOKIE,
                        cookie(reply.token(), Duration.ofDays(30)).toString())
                .body(Map.of("sessionId", reply.sessionId(), "csrfToken", reply.csrfToken()));
    }

    @GetMapping("/api/admin/session")
    public Map<String, String> session(HttpServletRequest req) {
        AdminPrincipal principal = (AuthService.AdminPrincipal) req.getAttribute("admin");
        return Map.of(
                "sessionId",
                principal.sessionId(),
                "csrfToken",
                AuthService.csrfFor(security.cookieToken(req)));
    }

    @PostMapping("/api/collector/enroll")
    public AuthService.EnrollmentReply enroll(
            @RequestBody EnrollmentInput input, HttpServletRequest req) {
        limiter.check(req.getRemoteAddr());

        try {
            EnrollmentReply reply = auth.enroll(input.code(), input.currentPuuid());
            limiter.succeeded(req.getRemoteAddr());

            return reply;
        } catch (ApiException e) {
            limiter.failed(req.getRemoteAddr());
            throw e;
        }
    }

    @PostMapping("/api/admin/codes")
    public AuthService.CodeReply code(@RequestBody IssueCodeInput input) {
        return auth.issueCode(input.scope(), input.memberId(), "owner");
    }

    @GetMapping("/api/admin/sessions")
    public Object sessions() {
        return auth.sessions();
    }

    @GetMapping("/api/admin/collector-credentials")
    public Object credentials() {
        return auth.credentials();
    }

    @DeleteMapping("/api/admin/{kind:codes|sessions|collector-credentials}/{id}")
    public ResponseEntity<?> revoke(@PathVariable String kind, @PathVariable String id) {
        auth.revoke(kind, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/admin/logout")
    public ResponseEntity<?> logout(HttpServletRequest req) {
        auth.revoke(
                "sessions", ((AuthService.AdminPrincipal) req.getAttribute("admin")).sessionId());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString())
                .build();
    }

    private ResponseCookie cookie(String token, Duration age) {
        return ResponseCookie.from(security.cookieName(), token)
                .httpOnly(true)
                .secure(!security.devHttp)
                .sameSite("Strict")
                .path("/")
                .maxAge(age)
                .build();
    }
}
