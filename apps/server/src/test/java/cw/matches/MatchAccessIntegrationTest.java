package cw.matches;
import cw.support.DatabaseTestSupport;
import cw.auth.AuthService;
import cw.contracts.MatchContracts.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.*;
import jakarta.servlet.http.Cookie;
import java.util.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.assertj.core.api.Assertions.*;
@AutoConfigureMockMvc(print=org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint.NONE)
class MatchAccessIntegrationTest extends DatabaseTestSupport {
    @Autowired MockMvc mvc;
    @Autowired AuthService auth;
    record Login(Cookie cookie,String csrf) {}
    Login login() throws Exception {
        var code=auth.issueCode("admin",null,"test");
        var response=mvc.perform(post("/api/admin/session").header("Origin","http://localhost:8080").contentType("application/json").content(json.writeValueAsString(Map.of("code",code.code())))).andReturn().getResponse();
        return new Login(response.getCookie("cw-admin-dev"),json.readTree(response.getContentAsString()).get("csrfToken").asString());
    }
    String body(String path) throws Exception {
        var response=mvc.perform(get(path)).andReturn().getResponse(); assertThat(response.getStatus()).isEqualTo(200); return response.getContentAsString();
    }
    @Test void publicSafeDto() throws Exception {
        registered(); String result=body("/api/matches/"+KEY);
        assertThat(result).doesNotContain("puuid","rawJson","rawMatch","credential","secretHash","fixture-player");
        assertThat(json.readTree(result).get("participants")).hasSize(10);
        assertThat(result).contains("championDamage","objectiveDamage","turretDamage","UTILITY","recalculating");
        assertThat(body("/api/members")).doesNotContain("puuid","riotId","seedSkill");
    }
    @Test void pendingNotPublic() throws Exception {
        ingest.ingestMatch(input(),actor(1));
        assertThat(mvc.perform(get("/api/matches/"+KEY)).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(json.readTree(body("/api/matches")).get("items")).isEmpty();
    }
    @Test void onlyOwnerEdits() throws Exception {
        registered(); var code=auth.issueCode("collector","member-1","test"); var token=auth.enroll(code.code(),actor(1).puuid()).token();
        assertThat(mvc.perform(patch("/api/admin/matches/"+KEY+"/roles").header("Authorization","Bearer "+token).header("Origin","http://localhost:8080").contentType("application/json").content(json.writeValueAsString(Map.of("rolesByPuuid",roles(true))))).andReturn().getResponse().getStatus()).isEqualTo(403);
        var login=login();
        assertThat(mvc.perform(patch("/api/admin/matches/"+KEY+"/roles").cookie(login.cookie()).header("Origin","http://localhost:8080").header("X-CSRF-Token",login.csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("rolesByPuuid",roles(true))))).andReturn().getResponse().getStatus()).isEqualTo(200);
        assertThat(collector.getCollectorMatch(KEY,actor(1)).confirmedRoles()).isEqualTo(roles(true)); assertThat(revision()).isEqualTo(2); assertThat(jobs()).isEqualTo(2);
    }
    @Test void cancelHidesImmediately() throws Exception {
        registered(); var login=login();
        for(int i=0;i<2;i++) assertThat(mvc.perform(post("/api/admin/matches/"+KEY+"/cancel").cookie(login.cookie()).header("Origin","http://localhost:8080").header("X-CSRF-Token",login.csrf())).andReturn().getResponse().getStatus()).isEqualTo(200);
        assertThat(mvc.perform(get("/api/matches/"+KEY)).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(json.readTree(body("/api/matches")).get("items")).isEmpty(); assertThat(revision()).isEqualTo(2); assertThat(jobs()).isEqualTo(2);
        assertThat(ingest.ingestMatch(input(),actor(1)).disposition()).isEqualTo("already_canceled");
    }
    @Test void profileRoleDoesNotRewriteHistory() throws Exception {
        registered(); var login=login();
        assertThat(mvc.perform(patch("/api/admin/members/member-1").cookie(login.cookie()).header("Origin","http://localhost:8080").header("X-CSRF-Token",login.csrf()).contentType("application/json").content("{\"primaryRole\":\"UTILITY\"}")).andReturn().getResponse().getStatus()).isEqualTo(200);
        assertThat(collector.getCollectorMatch(KEY,actor(1)).confirmedRoles()).isEqualTo(roles(false));
    }
    @Test void optionalFiltersCompose() throws Exception {
        registered();
        assertThat(json.readTree(body("/api/matches")).get("items")).hasSize(1);
        assertThat(json.readTree(body("/api/matches?memberId=member-1")).get("items")).hasSize(1);
        assertThat(json.readTree(body("/api/matches?memberId=member-1&championId=14&role=TOP&win=false")).get("items")).hasSize(1);
        assertThat(json.readTree(body("/api/matches?memberId=member-1&role=JUNGLE")).get("items")).isEmpty();
        assertThat(json.readTree(body("/api/matches?memberId=member-1&win=true")).get("items")).isEmpty();
        assertThat(json.readTree(body("/api/members/member-1/matches?role=TOP")).get("items")).hasSize(1);
    }
    @Test void filteredMatchesAppearOnce() throws Exception {
        for(int i=0;i<4;i++) {
            var a=raw(); String id="90000000000000000000"+(i+1); a.put("gameId",id);
            ingest.ingestMatch(new IngestMatchInput(a,"s"+i,1),actor(1));
            registration.registerMatch(new ConfirmationInput("KR:"+id,roles(false),"c"+i),actor(1));
        }
        Set<String> keys=new HashSet<>(); String cursor=null;
        for(int page=0;page<2;page++) {
            String url="/api/matches?win=false&limit=2"+(cursor==null?"":"&cursor="+cursor);
            var result=json.readTree(body(url)); assertThat(result.get("items")).hasSize(2);
            for(var match:result.get("items")) assertThat(keys.add(match.get("matchKey").asString())).isTrue();
            cursor=result.get("nextCursor").isNull()?null:result.get("nextCursor").asString();
        }
        assertThat(keys).hasSize(4); assertThat(cursor).isNull();
    }
    @Test void noOpRoleCorrectionDoesNotCreateWork() throws Exception {
        registered(); var login=login();
        assertThat(mvc.perform(patch("/api/admin/matches/"+KEY+"/roles").cookie(login.cookie()).header("Origin","http://localhost:8080").header("X-CSRF-Token",login.csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("rolesByPuuid",roles(false))))).andReturn().getResponse().getStatus()).isEqualTo(200);
        assertThat(revision()).isEqualTo(1); assertThat(jobs()).isEqualTo(1);
    }
    @Test void correctionAuditFailureRollsBackRolesRevisionAndJob() throws Exception {
        registered(); var login=login(); long audits=jdbc.queryForObject("select count(*) from audit_log",Long.class);
        jdbc.execute("alter table audit_log add constraint injected_correction_failure check(action <> 'roles_corrected')");
        try {
            assertThat(mvc.perform(patch("/api/admin/matches/"+KEY+"/roles").cookie(login.cookie()).header("Origin","http://localhost:8080")
                .header("X-CSRF-Token",login.csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("rolesByPuuid",roles(true)))))
                .andReturn().getResponse().getStatus()).isEqualTo(409);
        } finally { jdbc.execute("alter table audit_log drop constraint injected_correction_failure"); }
        assertThat(collector.getCollectorMatch(KEY,actor(1)).state()).isEqualTo("registered");
        assertThat(collector.getCollectorMatch(KEY,actor(1)).confirmedRoles()).isEqualTo(roles(false));
        assertThat(revision()).isEqualTo(1); assertThat(jobs()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_log",Long.class)).isEqualTo(audits);
    }
    @Test void cancellationJobFailureRollsBackStateRevisionAndAudit() throws Exception {
        registered(); var login=login(); long audits=jdbc.queryForObject("select count(*) from audit_log",Long.class);
        jdbc.execute("alter table recalculation_jobs add constraint injected_cancel_failure check(source_revision <> 2)");
        try {
            assertThat(mvc.perform(post("/api/admin/matches/"+KEY+"/cancel").cookie(login.cookie()).header("Origin","http://localhost:8080")
                .header("X-CSRF-Token",login.csrf())).andReturn().getResponse().getStatus()).isEqualTo(409);
        } finally { jdbc.execute("alter table recalculation_jobs drop constraint injected_cancel_failure"); }
        assertThat(collector.getCollectorMatch(KEY,actor(1)).state()).isEqualTo("registered");
        assertThat(collector.getCollectorMatch(KEY,actor(1)).confirmedRoles()).isEqualTo(roles(false));
        assertThat(mvc.perform(get("/api/matches/"+KEY)).andReturn().getResponse().getStatus()).isEqualTo(200);
        assertThat(revision()).isEqualTo(1); assertThat(jobs()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_log",Long.class)).isEqualTo(audits);
    }
}
