package cw.auth;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import cw.contracts.EvaluationContracts.GameScore;
import cw.support.DatabaseTestSupport;
import jakarta.servlet.http.Cookie;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

@AutoConfigureMockMvc(print = org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint.NONE)
class StrictJsonIntegrationTest extends DatabaseTestSupport {
    @Autowired MockMvc mvc;
    @Autowired AuthService auth;

    record Login(Cookie cookie, String csrf) {}

    private String collectorToken() {
        var code = auth.issueCode("collector", "member-1", "test");
        return auth.enroll(code.code(), actor(1).puuid()).token();
    }

    private Login login() throws Exception {
        var code = auth.issueCode("admin", null, "test");
        var response =
                mvc.perform(
                                post("/api/admin/session")
                                        .header("Origin", "http://localhost:8080")
                                        .contentType("application/json")
                                        .content(
                                                json.writeValueAsString(
                                                        Map.of("code", code.code()))))
                        .andReturn()
                        .getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        return new Login(
                response.getCookie("cw-admin-dev"),
                json.readTree(response.getContentAsString()).get("csrfToken").asString());
    }

    private Map<String, Integer> numericRoles(boolean reverse) {
        Map<String, Integer> result = new LinkedHashMap<>();
        for (int i = 1; i <= 10; i++)
            result.put(
                    String.format("fixture-player-%02d", i),
                    reverse ? 4 - (i - 1) % 5 : (i - 1) % 5);
        return result;
    }

    private long audits() {
        return jdbc.queryForObject("select count(*) from audit_log", Long.class);
    }

    @Test
    void numericRolesCannotConfirmOrMutatePendingMatch() throws Exception {
        ingest.ingestMatch(input(), actor(1));
        String token = collectorToken();
        long beforeAudits = audits();
        var response =
                mvc.perform(
                                post("/api/collector/matches/" + KEY + "/confirm")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType("application/json")
                                        .content(
                                                json.writeValueAsString(
                                                        Map.of(
                                                                "rolesByPuuid",
                                                                numericRoles(false),
                                                                "clientSubmissionId",
                                                                "numeric-roles"))))
                        .andReturn()
                        .getResponse();
        assertThat(response.getStatus()).isEqualTo(400);
        assertThat(response.getContentAsString())
                .contains("INVALID_REQUEST")
                .doesNotContain("fixture-player");
        assertThat(collector.getCollectorMatch(KEY, actor(1)).state()).isEqualTo("pending");
        assertThat(collector.getCollectorMatch(KEY, actor(1)).confirmedRoles()).isNull();
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from match_participants where role is not null",
                                Integer.class))
                .isZero();
        assertThat(revision()).isZero();
        assertThat(jobs()).isZero();
        assertThat(audits()).isEqualTo(beforeAudits);
        assertThat(
                        mvc.perform(
                                        post("/api/collector/matches/" + KEY + "/confirm")
                                                .header("Authorization", "Bearer " + token)
                                                .contentType("application/json")
                                                .content(
                                                        json.writeValueAsString(
                                                                Map.of(
                                                                        "rolesByPuuid",
                                                                        roles(false),
                                                                        "clientSubmissionId",
                                                                        "string-roles"))))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(200);
        assertThat(collector.getCollectorMatch(KEY, actor(1)).confirmedRoles())
                .isEqualTo(roles(false));
        assertThat(revision()).isEqualTo(1);
        assertThat(jobs()).isEqualTo(1);
    }

    @Test
    void numericRolesCannotCorrectOrMutateRegisteredMatch() throws Exception {
        registered();
        var login = login();
        long beforeAudits = audits();
        var response =
                mvc.perform(
                                patch("/api/admin/matches/" + KEY + "/roles")
                                        .cookie(login.cookie())
                                        .header("Origin", "http://localhost:8080")
                                        .header("X-CSRF-Token", login.csrf())
                                        .contentType("application/json")
                                        .content(
                                                json.writeValueAsString(
                                                        Map.of(
                                                                "rolesByPuuid",
                                                                numericRoles(true)))))
                        .andReturn()
                        .getResponse();
        assertThat(response.getStatus()).isEqualTo(400);
        assertThat(response.getContentAsString())
                .contains("INVALID_REQUEST")
                .doesNotContain("fixture-player");
        assertThat(collector.getCollectorMatch(KEY, actor(1)).state()).isEqualTo("registered");
        assertThat(collector.getCollectorMatch(KEY, actor(1)).confirmedRoles())
                .isEqualTo(roles(false));
        assertThat(revision()).isEqualTo(1);
        assertThat(jobs()).isEqualTo(1);
        assertThat(audits()).isEqualTo(beforeAudits);
        assertThat(
                        mvc.perform(
                                        patch("/api/admin/matches/" + KEY + "/roles")
                                                .cookie(login.cookie())
                                                .header("Origin", "http://localhost:8080")
                                                .header("X-CSRF-Token", login.csrf())
                                                .contentType("application/json")
                                                .content(
                                                        json.writeValueAsString(
                                                                Map.of(
                                                                        "rolesByPuuid",
                                                                        roles(true)))))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(200);
        assertThat(collector.getCollectorMatch(KEY, actor(1)).confirmedRoles())
                .isEqualTo(roles(true));
        assertThat(revision()).isEqualTo(2);
        assertThat(jobs()).isEqualTo(2);
    }

    @Test
    void additionalRawDecimalsSurviveHttpDatabaseAndAdminReadExactly() throws Exception {
        String token = collectorToken();
        var login = login();
        var raw = raw();
        var precise = new BigDecimal("0.12345678901234567890123456789");
        var tiny = new BigDecimal("1.2345678901234567890123456789E-40");
        raw.put("gameId", new BigInteger("9000000000000000000001"));
        raw.putObject("additionalMetrics").put("precise", precise).putArray("nested").add(tiny);
        assertThat(
                        mvc.perform(
                                        post("/api/collector/matches/ingest")
                                                .header("Authorization", "Bearer " + token)
                                                .contentType("application/json")
                                                .content(
                                                        json.writeValueAsString(
                                                                Map.of(
                                                                        "rawMatch",
                                                                        raw,
                                                                        "schemaVersion",
                                                                        1,
                                                                        "clientSubmissionId",
                                                                        "decimal-roundtrip"))))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(200);
        // Parse the persisted/returned wire values independently, without introducing test-side
        // double rounding.
        var exact =
                JsonMapper.builder()
                        .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
                        .build();
        var stored =
                exact.readTree(
                        jdbc.queryForObject(
                                "select raw_json from matches where id=?", String.class, KEY));
        assertThat(stored.at("/additionalMetrics/precise").decimalValue())
                .isEqualByComparingTo(precise);
        assertThat(stored.at("/additionalMetrics/nested/0").decimalValue())
                .isEqualByComparingTo(tiny);
        assertThat(stored.get("gameId").bigIntegerValue())
                .isEqualTo(new BigInteger("9000000000000000000001"));
        var response =
                mvc.perform(get("/api/admin/matches/" + KEY).cookie(login.cookie()))
                        .andReturn()
                        .getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        var returned = exact.readTree(response.getContentAsString()).get("rawMatch");
        assertThat(returned.at("/additionalMetrics/precise").decimalValue())
                .isEqualByComparingTo(precise);
        assertThat(returned.at("/additionalMetrics/nested/0").decimalValue())
                .isEqualByComparingTo(tiny);
        var normalized = collector.getCollectorMatch(KEY, actor(1)).match();
        assertThat(normalized.gameId()).isEqualTo("9000000000000000000001");
        assertThat(normalized.participants().getFirst().kills()).isEqualTo(4);
        assertThat(normalized.participants().getFirst().championDamage()).isEqualTo(26173);
        assertThat(revision()).isZero();
        assertThat(jobs()).isZero();
    }

    @Test
    void requiredStatsStillRejectDecimalTokensWithoutWrites() throws Exception {
        String token = collectorToken();
        long beforeAudits = audits();
        for (String value : List.of("1.25", "1.0")) {
            var raw = raw();
            ((ObjectNode) raw.at("/participants/0/stats")).put("kills", new BigDecimal(value));
            var response =
                    mvc.perform(
                                    post("/api/collector/matches/ingest")
                                            .header("Authorization", "Bearer " + token)
                                            .contentType("application/json")
                                            .content(
                                                    json.writeValueAsString(
                                                            Map.of(
                                                                    "rawMatch",
                                                                    raw,
                                                                    "schemaVersion",
                                                                    1,
                                                                    "clientSubmissionId",
                                                                    "decimal-stat"))))
                            .andReturn()
                            .getResponse();
            assertThat(response.getStatus()).isEqualTo(422);
            assertThat(response.getContentAsString())
                    .contains("participants.0.kills", "INVALID_TYPE");
        }
        assertThat(matches.count()).isZero();
        assertThat(audits()).isEqualTo(beforeAudits);
        assertThat(revision()).isZero();
        assertThat(jobs()).isZero();
    }

    @Test
    void typedEvaluationDoublesRemainCompatible() {
        String wire =
                """
            {"matchKey":"KR:1","memberId":"member-1","role":"TOP","scoringVersion":"provisional",
             "score":50.25,"rank":1,"breakdown":{"damage":12.75}}
            """;
        var score = json.readValue(wire, GameScore.class);
        assertThat(score.score()).isEqualTo(50.25);
        assertThat(score.breakdown()).containsEntry("damage", 12.75);
        assertThat(json.readValue(json.writeValueAsString(score), GameScore.class))
                .isEqualTo(score);
    }
}
