package cw.auth;
import cw.support.DatabaseTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import jakarta.servlet.http.Cookie;
import java.util.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.assertj.core.api.Assertions.*;

@AutoConfigureMockMvc(print=org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint.NONE)
@org.junit.jupiter.api.extension.ExtendWith(org.springframework.boot.test.system.OutputCaptureExtension.class)
class HttpBoundaryIntegrationTest extends DatabaseTestSupport {
    @Autowired MockMvc mvc;
    @Autowired AuthService auth;
    @Autowired AuthRateLimiter limiter;
    record Login(Cookie cookie,String csrf) {}
    Login login() throws Exception {
        limiter.succeeded("127.0.0.1");
        var code=auth.issueCode("admin",null,"test");
        var response=mvc.perform(post("/api/admin/session").header("Origin","http://localhost:8080").contentType("application/json").content(json.writeValueAsString(Map.of("code",code.code())))).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        return new Login(response.getCookie("cw-admin-dev"),json.readTree(response.getContentAsString()).get("csrfToken").asString());
    }
    @Test void secretsNeverEnterApplicationLogs(org.springframework.boot.test.system.CapturedOutput captured) throws Exception {
        limiter.succeeded("127.0.0.1");
        String sentinel="private-code-log-sentinel";
        var response=mvc.perform(post("/api/collector/enroll").contentType("application/json").content(json.writeValueAsString(Map.of("code",sentinel,"currentPuuid","private-account-sentinel")))).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(captured.getAll()).doesNotContain(sentinel,"private-account-sentinel");
        limiter.succeeded("127.0.0.1");
    }
    @Test void sessionReloadRestoresCsrf() throws Exception {
        var login=login(); var response=mvc.perform(get("/api/admin/session").cookie(login.cookie())).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(json.readTree(response.getContentAsString()).get("csrfToken").asString()).isEqualTo(login.csrf());
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
    }
    @Test void malformedInputsArePrivateStructuredErrors() throws Exception {
        var login=login();
        for(String value:List.of("{}","{\"scope\":null}","{\"scope\":\"admin\",\"unexpected\":\"private-sentinel\"}","{\"scope\":\"admin\",\"scope\":\"collector\"}")) {
            var response=mvc.perform(post("/api/admin/codes").cookie(login.cookie()).header("Origin","http://localhost:8080").header("X-CSRF-Token",login.csrf()).contentType("application/json").content(value)).andReturn().getResponse();
            assertThat(response.getStatus()).isBetween(400,499);
            assertThat(response.getContentAsString()).contains("code","retryable").doesNotContain("private-sentinel","Exception","stackTrace");
        }
    }
    @Test void bodyCapWorksWithoutContentLength() throws Exception {
        var response=mvc.perform(post("/api/collector/enroll").contentType("application/json").content("x".repeat(ApiSecurityFilter.MAX_BODY_BYTES+1))
            .with(request->{ request.removeHeader("Content-Length"); return request; })).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(413); assertThat(response.getContentAsString()).contains("BODY_TOO_LARGE");
    }
    @Test void codeAttemptsLimitedAndSuccessfulLoginResets() throws Exception {
        limiter.succeeded("127.0.0.1");
        try {
            for(int i=0;i<5;i++) assertThat(mvc.perform(post("/api/collector/enroll").contentType("application/json").content("{\"code\":\"invalid-private-code\",\"currentPuuid\":\"none\"}")).andReturn().getResponse().getStatus()).isEqualTo(401);
            var blocked=mvc.perform(post("/api/collector/enroll").contentType("application/json").content("{\"code\":\"invalid-private-code\"}")).andReturn().getResponse();
            assertThat(blocked.getStatus()).isEqualTo(429); assertThat(blocked.getHeader("Retry-After")).isEqualTo("600");
            assertThat(blocked.getContentAsString()).doesNotContain("invalid-private-code");
            limiter.succeeded("127.0.0.1");
            var code=auth.issueCode("collector","member-1","test");
            assertThat(mvc.perform(post("/api/collector/enroll").contentType("application/json").content(json.writeValueAsString(Map.of("code",code.code(),"currentPuuid",actor(1).puuid())))).andReturn().getResponse().getStatus()).isEqualTo(200);
        } finally { limiter.succeeded("127.0.0.1"); }
    }
    @Test void seedMutationOnlyCreatesWorkOnceAndIdentityCannotChange() throws Exception {
        var login=login();
        for(int i=0;i<2;i++) assertThat(mvc.perform(patch("/api/admin/members/member-1").cookie(login.cookie()).header("Origin","http://localhost:8080").header("X-CSRF-Token",login.csrf()).contentType("application/json").content("{\"seedSkill\":0}")).andReturn().getResponse().getStatus()).isEqualTo(200);
        assertThat(revision()).isEqualTo(1); assertThat(jobs()).isEqualTo(1);
        assertThat(mvc.perform(patch("/api/admin/members/member-1").cookie(login.cookie()).header("Origin","http://localhost:8080").header("X-CSRF-Token",login.csrf()).contentType("application/json").content("{\"puuid\":\"different\"}")).andReturn().getResponse().getStatus()).isEqualTo(422);
    }
    @Test void collectorHttpRoundTripKeepsLargeNumericGameId() throws Exception {
        var code=auth.issueCode("collector","member-1","test"); var token=auth.enroll(code.code(),actor(1).puuid()).token();
        var r=raw(); r.put("gameId",new java.math.BigInteger("9000000000000000000001"));
        String request=json.writeValueAsString(Map.of("rawMatch",r,"schemaVersion",1,"clientSubmissionId","http-round-trip"));
        assertThat(mvc.perform(post("/api/collector/matches/ingest").header("Authorization","Bearer "+token).contentType("application/json").content(request)).andReturn().getResponse().getStatus()).isEqualTo(200);
        var response=mvc.perform(get("/api/collector/matches/"+KEY).header("Authorization","Bearer "+token)).andReturn().getResponse();
        assertThat(json.readTree(response.getContentAsString()).at("/match/gameId").asString()).isEqualTo("9000000000000000000001");
        assertThat(mvc.perform(post("/api/collector/matches/"+KEY+"/confirm").header("Authorization","Bearer "+token).contentType("application/json").content(json.writeValueAsString(Map.of("rolesByPuuid",roles(false),"clientSubmissionId","http-confirm")))).andReturn().getResponse().getStatus()).isEqualTo(200);
    }
}
