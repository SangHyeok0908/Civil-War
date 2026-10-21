package cw.auth;
import cw.support.DatabaseTestSupport;
import cw.contracts.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.*;
import jakarta.servlet.http.Cookie;
import java.util.Map;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.assertj.core.api.Assertions.*;

@AutoConfigureMockMvc(print=org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint.NONE)
class AuthMembersIntegrationTest extends DatabaseTestSupport {
    @Autowired MockMvc mvc;
    @Autowired AuthService auth;
    record Login(Cookie cookie,String csrf) {}
    Login login() throws Exception {
        var code=auth.issueCode("admin",null,"test");
        var response=mvc.perform(post("/api/admin/session").header("Origin","http://localhost:8080").contentType("application/json").content(json.writeValueAsString(Map.of("code",code.code())))).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        return new Login(response.getCookie("cw-admin-dev"),json.readTree(response.getContentAsString()).get("csrfToken").asString());
    }
    String enroll(int member) throws Exception {
        var code=auth.issueCode("collector","member-"+member,"test");
        var response=mvc.perform(post("/api/collector/enroll").contentType("application/json").content(json.writeValueAsString(Map.of("code",code.code(),"currentPuuid",actor(member).puuid())))).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(200); return json.readTree(response.getContentAsString()).get("token").asString();
    }
    @Test void oneUseAtomic() throws Exception {
        var code=auth.issueCode("collector","member-1","test");
        var body=json.writeValueAsString(Map.of("code",code.code(),"currentPuuid",actor(1).puuid()));
        var result=concurrent(()->mvc.perform(post("/api/collector/enroll").contentType("application/json").content(body)).andReturn().getResponse().getStatus(),
            ()->mvc.perform(post("/api/collector/enroll").contentType("application/json").content(body)).andReturn().getResponse().getStatus());
        assertThat(result).containsExactlyInAnyOrder(200,401);
        assertThat(jdbc.queryForObject("select count(*) from collector_credentials",Integer.class)).isEqualTo(1);
    }
    @Test void codeScopeIsolation() throws Exception {
        String token=enroll(1);
        assertThat(mvc.perform(get("/api/admin/members").header("Authorization","Bearer "+token)).andReturn().getResponse().getStatus()).isEqualTo(403);
        var code=auth.issueCode("collector","member-1","test");
        assertThat(mvc.perform(post("/api/admin/session").header("Origin","http://localhost:8080").contentType("application/json").content(json.writeValueAsString(Map.of("code",code.code())))).andReturn().getResponse().getStatus()).isEqualTo(401);
        var adminCode=auth.issueCode("admin",null,"test");
        assertThat(mvc.perform(post("/api/collector/enroll").contentType("application/json").content(json.writeValueAsString(Map.of("code",adminCode.code(),"currentPuuid",actor(1).puuid())))).andReturn().getResponse().getStatus()).isEqualTo(401);
    }
    @Test void expiredAndRevoked() throws Exception {
        var code=auth.issueCode("collector","member-1","test");
        jdbc.update("update enrollment_codes set expires_at=now()-interval '1 second' where id=?",code.id());
        assertThat(mvc.perform(post("/api/collector/enroll").contentType("application/json").content(json.writeValueAsString(Map.of("code",code.code(),"currentPuuid",actor(1).puuid())))).andReturn().getResponse().getStatus()).isEqualTo(401);
        String token=enroll(1); jdbc.update("update collector_credentials set revoked=true");
        assertThat(mvc.perform(get("/api/collector/members").header("Authorization","Bearer "+token)).andReturn().getResponse().getStatus()).isEqualTo(401);
        var login=login(); jdbc.update("update admin_sessions set last_seen_at=now()-interval '8 days'");
        assertThat(mvc.perform(get("/api/admin/members").cookie(login.cookie())).andReturn().getResponse().getStatus()).isEqualTo(401);
    }
    @Test void csrfAndOrigin() throws Exception {
        var login=login(); String body="{\"scope\":\"admin\"}";
        assertThat(mvc.perform(post("/api/admin/codes").cookie(login.cookie()).header("Origin","http://evil.invalid").header("X-CSRF-Token",login.csrf()).contentType("application/json").content(body)).andReturn().getResponse().getStatus()).isEqualTo(403);
        assertThat(mvc.perform(post("/api/admin/codes").cookie(login.cookie()).header("Origin","http://localhost:8080").contentType("application/json").content(body)).andReturn().getResponse().getStatus()).isEqualTo(403);
        assertThat(mvc.perform(post("/api/admin/codes").cookie(login.cookie()).header("Origin","http://localhost:8080").header("X-CSRF-Token",login.csrf()).contentType("application/json").content(body)).andReturn().getResponse().getStatus()).isEqualTo(200);
    }
    @Test void localRecovery() throws Exception {
        var login=login(); var old=auth.issueCode("admin",null,"test"); auth.recoverAdmin(true);
        assertThat(mvc.perform(get("/api/admin/members").cookie(login.cookie())).andReturn().getResponse().getStatus()).isEqualTo(401);
        assertThat(mvc.perform(post("/api/admin/session").header("Origin","http://localhost:8080").contentType("application/json").content(json.writeValueAsString(Map.of("code",old.code())))).andReturn().getResponse().getStatus()).isEqualTo(401);
        assertThat(jdbc.queryForObject("select count(*) from enrollment_codes where scope='admin' and not revoked and not consumed",Integer.class)).isEqualTo(1);
    }
    @Test void memberIdentityStable() throws Exception {
        var login=login();
        var response=mvc.perform(patch("/api/admin/members/member-1").cookie(login.cookie()).header("Origin","http://localhost:8080").header("X-CSRF-Token",login.csrf()).contentType("application/json").content("{\"displayName\":\"New Name\",\"riotId\":\"Renamed#KR\"}")).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(200); assertThat(members.findByPuuid(actor(1).puuid()).orElseThrow().id).isEqualTo("member-1");
        assertThat(revision()).isZero();
        assertThat(mvc.perform(patch("/api/admin/members/member-1").cookie(login.cookie()).header("Origin","http://localhost:8080").header("X-CSRF-Token",login.csrf()).contentType("application/json").content("{\"seedSkill\":101}")).andReturn().getResponse().getStatus()).isEqualTo(422);
    }
    @Test void accountMismatchDoesNotConsumeCode() throws Exception {
        var code=auth.issueCode("collector","member-1","test");
        var response=mvc.perform(post("/api/collector/enroll").contentType("application/json").content(json.writeValueAsString(Map.of("code",code.code(),"currentPuuid",actor(2).puuid())))).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(403); assertThat(response.getContentAsString()).contains("ACCOUNT_MISMATCH").doesNotContain(actor(1).puuid());
        assertThat(jdbc.queryForObject("select consumed from enrollment_codes where id=?",Boolean.class,code.id())).isFalse();
    }
    @Test void tokensAreHashedAndLogoutRevokes() throws Exception {
        var login=login();
        assertThat(jdbc.queryForObject("select secret_hash from admin_sessions limit 1",String.class)).hasSize(64).isNotEqualTo(login.cookie().getValue());
        assertThat(login.cookie().isHttpOnly()).isTrue(); assertThat(login.cookie().getAttribute("SameSite")).isEqualTo("Strict");
        assertThat(mvc.perform(post("/api/admin/logout").cookie(login.cookie()).header("Origin","http://localhost:8080").header("X-CSRF-Token",login.csrf())).andReturn().getResponse().getStatus()).isEqualTo(204);
        assertThat(mvc.perform(get("/api/admin/members").cookie(login.cookie())).andReturn().getResponse().getStatus()).isEqualTo(401);
    }
}
