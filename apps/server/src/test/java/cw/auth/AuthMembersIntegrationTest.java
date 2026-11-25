package cw.auth;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import cw.support.DatabaseTestSupport;
import cw.support.DatabaseTestSupport.CodeReply;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;

@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class AuthMembersIntegrationTest extends DatabaseTestSupport {
    @Autowired MockMvc mvc;
    @Autowired AuthService auth;

    record Login(Cookie cookie, String csrf) {}

    Login login() throws Exception {
        String code = ADMIN_CODE;
        MockHttpServletResponse response =
                mvc.perform(
                                post("/api/admin/session")
                                        .header("Origin", "http://localhost:8080")
                                        .contentType("application/json")
                                        .content(json.writeValueAsString(Map.of("code", code))))
                        .andReturn()
                        .getResponse();
        assertThat(response.getStatus()).isEqualTo(200);

        return new Login(
                response.getCookie("cw-admin-dev"),
                json.readTree(response.getContentAsString()).get("csrfToken").asString());
    }

    String enroll(int member) throws Exception {
        CodeReply code = collectorCode();
        MockHttpServletResponse response =
                mvc.perform(
                                post("/api/collector/enroll")
                                        .header("X-CW-Collector-Protocol", "2")
                                        .contentType("application/json")
                                        .content(
                                                json.writeValueAsString(
                                                        enrollmentBody(code.code(), member))))
                        .andReturn()
                        .getResponse();
        assertThat(response.getStatus()).isEqualTo(200);

        return json.readTree(response.getContentAsString()).get("token").asString();
    }

    @Test
    void concurrentGuessesCannotExceedFiveAttempts() throws Exception {
        try (java.util.concurrent.ExecutorService pool =
                java.util.concurrent.Executors.newFixedThreadPool(8)) {
            java.util.concurrent.CyclicBarrier barrier = new java.util.concurrent.CyclicBarrier(8);
            java.util.List<java.util.concurrent.Callable<Integer>> requests =
                    new java.util.ArrayList<>();
            for (int i = 0; i < 8; i++) {
                requests.add(
                        () -> {
                            barrier.await();
                            return mvc.perform(
                                            post("/api/admin/session")
                                                    .header("Origin", "http://localhost:8080")
                                                    .contentType("application/json")
                                                    .content("{\"code\":\"999999\"}"))
                                    .andReturn()
                                    .getResponse()
                                    .getStatus();
                        });
            }
            java.util.List<Integer> statuses = new java.util.ArrayList<>();
            for (java.util.concurrent.Future<Integer> result : pool.invokeAll(requests)) {
                statuses.add(result.get());
            }
            assertThat(statuses.stream().filter(code -> code == 401).count()).isEqualTo(5);
            assertThat(statuses.stream().filter(code -> code == 429).count()).isEqualTo(3);
        }
    }

    @Test
    void protocolOneRequiresUpdateBeforeDecoding() throws Exception {
        assertThat(
                        mvc.perform(
                                        post("/api/collector/enroll")
                                                .contentType("application/json")
                                                .content("{\"currentPuuid\":\"old\"}"))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(426);
    }

    @Test
    void commonCodeSupportsConcurrentDevices() throws Exception {
        CodeReply code = collectorCode();
        String body = json.writeValueAsString(enrollmentBody(code.code(), 1));
        List<Integer> result =
                concurrent(
                        () ->
                                mvc.perform(
                                                post("/api/collector/enroll")
                                                        .header("X-CW-Collector-Protocol", "2")
                                                        .contentType("application/json")
                                                        .content(body))
                                        .andReturn()
                                        .getResponse()
                                        .getStatus(),
                        () ->
                                mvc.perform(
                                                post("/api/collector/enroll")
                                                        .header("X-CW-Collector-Protocol", "2")
                                                        .contentType("application/json")
                                                        .content(body))
                                        .andReturn()
                                        .getResponse()
                                        .getStatus());
        assertThat(result).containsExactlyInAnyOrder(200, 200);
        assertThat(jdbc.queryForObject("select count(*) from collector_credentials", Integer.class))
                .isEqualTo(2);
    }

    @Test
    void fixedAdminCodeSupportsConcurrentSessions() throws Exception {
        String code = ADMIN_CODE;
        String body = json.writeValueAsString(Map.of("code", code));
        List<Integer> results =
                concurrent(
                        () ->
                                mvc.perform(
                                                post("/api/admin/session")
                                                        .header("Origin", "http://localhost:8080")
                                                        .contentType("application/json")
                                                        .content(body))
                                        .andReturn()
                                        .getResponse()
                                        .getStatus(),
                        () ->
                                mvc.perform(
                                                post("/api/admin/session")
                                                        .header("Origin", "http://localhost:8080")
                                                        .contentType("application/json")
                                                        .content(body))
                                        .andReturn()
                                        .getResponse()
                                        .getStatus());
        assertThat(results).containsExactlyInAnyOrder(200, 200);
        assertThat(jdbc.queryForObject("select count(*) from admin_sessions", Integer.class))
                .isEqualTo(2);
    }

    @Test
    void ownerCanRevokeCredentialAndUnusedCodeOverHttp() throws Exception {
        String token = enroll(1);
        CodeReply code = collectorCode();
        Login login = login();
        String credential =
                jdbc.queryForObject("select id from collector_credentials limit 1", String.class);

        for (String path :
                List.of(
                        "/api/admin/collector-credentials/" + credential,
                        "/api/admin/collector-code")) {
            assertThat(
                            mvc.perform(
                                            delete(path)
                                                    .cookie(login.cookie())
                                                    .header("Origin", "http://localhost:8080")
                                                    .header("X-CSRF-Token", login.csrf()))
                                    .andReturn()
                                    .getResponse()
                                    .getStatus())
                    .isEqualTo(204);
        }

        assertThat(
                        mvc.perform(
                                        get("/api/collector/members")
                                                .header("X-CW-Collector-Protocol", "2")
                                                .header("X-CW-Collector-Protocol", "2")
                                                .header("Authorization", "Bearer " + token))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(401);
        assertThat(
                        mvc.perform(
                                        post("/api/collector/enroll")
                                                .header("X-CW-Collector-Protocol", "2")
                                                .contentType("application/json")
                                                .content(
                                                        json.writeValueAsString(
                                                                enrollmentBody(code.code(), 2))))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(401);
    }

    @Test
    void absoluteSessionLifetimeCannotBeExtendedByActivity() throws Exception {
        Login login = login();
        jdbc.update(
                "update admin_sessions set created_at=now()-interval '31 days', last_seen_at=now()");
        assertThat(
                        mvc.perform(get("/api/admin/session").cookie(login.cookie()))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(401);
    }

    @Test
    void codeScopeIsolation() throws Exception {
        String token = enroll(1);
        assertThat(
                        mvc.perform(
                                        get("/api/admin/members")
                                                .header("X-CW-Collector-Protocol", "2")
                                                .header("Authorization", "Bearer " + token))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(403);

        CodeReply code = collectorCode();
        assertThat(
                        mvc.perform(
                                        post("/api/admin/session")
                                                .header("Origin", "http://localhost:8080")
                                                .contentType("application/json")
                                                .content(
                                                        json.writeValueAsString(
                                                                Map.of("code", code.code()))))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(401);

        String adminCode = ADMIN_CODE;
        assertThat(
                        mvc.perform(
                                        post("/api/collector/enroll")
                                                .header("X-CW-Collector-Protocol", "2")
                                                .contentType("application/json")
                                                .content(
                                                        json.writeValueAsString(
                                                                enrollmentBody(adminCode, 1))))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(401);
    }

    @Test
    void expiredAndRevoked() throws Exception {
        String token = enroll(1);
        jdbc.update("update collector_credentials set revoked=true");
        assertThat(
                        mvc.perform(
                                        get("/api/collector/members")
                                                .header("X-CW-Collector-Protocol", "2")
                                                .header("X-CW-Collector-Protocol", "2")
                                                .header("Authorization", "Bearer " + token))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(401);

        Login login = login();
        jdbc.update("update admin_sessions set last_seen_at=now()-interval '8 days'");
        assertThat(
                        mvc.perform(get("/api/admin/members").cookie(login.cookie()))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(401);
    }

    @Test
    void csrfAndOrigin() throws Exception {
        Login login = login();
        String body = "{}";
        assertThat(
                        mvc.perform(
                                        post("/api/admin/collector-code")
                                                .cookie(login.cookie())
                                                .header("Origin", "http://evil.invalid")
                                                .header("X-CSRF-Token", login.csrf())
                                                .contentType("application/json")
                                                .content(body))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(403);
        assertThat(
                        mvc.perform(
                                        post("/api/admin/collector-code")
                                                .cookie(login.cookie())
                                                .header("Origin", "http://localhost:8080")
                                                .contentType("application/json")
                                                .content(body))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(403);
        assertThat(
                        mvc.perform(
                                        post("/api/admin/collector-code")
                                                .cookie(login.cookie())
                                                .header("Origin", "http://localhost:8080")
                                                .header("X-CSRF-Token", login.csrf())
                                                .contentType("application/json")
                                                .content(body))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(200);
    }

    @Test
    void revokedBrowserSessionDoesNotDisableFixedLogin() throws Exception {
        Login login = login();
        jdbc.update("update admin_sessions set revoked=true");
        assertThat(
                        mvc.perform(get("/api/admin/members").cookie(login.cookie()))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(401);
        assertThat(
                        mvc.perform(
                                        post("/api/admin/session")
                                                .header("Origin", "http://localhost:8080")
                                                .contentType("application/json")
                                                .content("{\"code\":\"" + ADMIN_CODE + "\"}"))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(200);
        assertThat(jdbc.queryForObject("select count(*) from enrollment_codes", Integer.class))
                .isZero();
    }

    @Test
    void memberIdentityStable() throws Exception {
        Login login = login();
        MockHttpServletResponse response =
                mvc.perform(
                                patch("/api/admin/members/member-1")
                                        .cookie(login.cookie())
                                        .header("Origin", "http://localhost:8080")
                                        .header("X-CSRF-Token", login.csrf())
                                        .contentType("application/json")
                                        .content("{\"riotId\":\"Renamed#KR\"}"))
                        .andReturn()
                        .getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(members.findByPuuid(actor(1).puuid()).orElseThrow().id).isEqualTo("member-1");
        assertThat(revision()).isZero();
        assertThat(
                        mvc.perform(
                                        patch("/api/admin/members/member-1")
                                                .cookie(login.cookie())
                                                .header("Origin", "http://localhost:8080")
                                                .header("X-CSRF-Token", login.csrf())
                                                .contentType("application/json")
                                                .content("{\"seedSkill\":101}"))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(422);
    }

    @Test
    void unknownCollectorCannotJoinAndCodeRemainsUsable() throws Exception {
        CodeReply code = collectorCode();
        Map<String, Object> body =
                Map.of(
                        "code",
                        code.code(),
                        "protocolVersion",
                        2,
                        "currentAccount",
                        Map.of(
                                "puuid",
                                "unregistered-current-player",
                                "riotId",
                                "Unknown#test",
                                "source",
                                "current_summoner",
                                "observedAt",
                                java.time.Instant.now().toString()));
        MockHttpServletResponse response =
                mvc.perform(
                                post("/api/collector/enroll")
                                        .header("X-CW-Collector-Protocol", "2")
                                        .contentType("application/json")
                                        .content(json.writeValueAsString(body)))
                        .andReturn()
                        .getResponse();
        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).contains("UNREGISTERED_COLLECTOR");
        assertThat(auth.enroll(code.code(), actor(1).puuid()).token()).hasSize(43);
    }

    @Test
    void tokensAreHashedAndLogoutRevokes() throws Exception {
        Login login = login();
        assertThat(
                        jdbc.queryForObject(
                                "select secret_hash from admin_sessions limit 1", String.class))
                .hasSize(64)
                .isNotEqualTo(login.cookie().getValue());
        assertThat(login.cookie().isHttpOnly()).isTrue();
        assertThat(login.cookie().getAttribute("SameSite")).isEqualTo("Strict");
        assertThat(
                        mvc.perform(
                                        post("/api/admin/logout")
                                                .cookie(login.cookie())
                                                .header("Origin", "http://localhost:8080")
                                                .header("X-CSRF-Token", login.csrf()))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(204);
        assertThat(
                        mvc.perform(get("/api/admin/members").cookie(login.cookie()))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(401);
    }

    @Test
    void referenceEndpointsAreGone() throws Exception {
        Login login = login();
        assertThat(
                        mvc.perform(
                                        get("/api/admin/members/member-1/role-suggestion")
                                                .cookie(login.cookie()))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(404);
        assertThat(
                        mvc.perform(
                                        post("/api/admin/member-references")
                                                .cookie(login.cookie())
                                                .header("Origin", "http://localhost:8080")
                                                .header("X-CSRF-Token", login.csrf())
                                                .contentType("application/json")
                                                .content(
                                                        "{\"memberId\":\"member-1\",\"officialPuuid\":\"x\",\"confirmedMapping\":true,\"samples\":[]}"))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(404);
    }

    @Test
    void referenceTablesAreDropped() {
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from information_schema.tables where table_name in ('member_reference_links','role_reference_samples')",
                                Long.class))
                .isZero();
    }
}
