package cw.auth;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import cw.contracts.ApiException;
import cw.support.DatabaseTestSupport;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.test.web.servlet.MockMvc;

@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class AdminCodeFormatTest extends DatabaseTestSupport {
    @Autowired AuthService auth;
    @Autowired MockMvc mvc;

    @Test
    void configuredCodeCanCreateIndependentSessionsRepeatedly() {
        AuthService.LoginReply first = auth.login(ADMIN_CODE);
        AuthService.LoginReply second = auth.login(ADMIN_CODE);
        assertThat(first.token()).hasSize(43).isNotEqualTo(second.token());
        assertThat(auth.requireAdmin(first.token()).sessionId()).isEqualTo(first.sessionId());
        assertThat(jdbc.queryForObject("select count(*) from enrollment_codes", Integer.class))
                .isZero();
    }

    @Test
    void oldIssuedCodeIsPreservedButNoLongerAuthenticates() {
        jdbc.update(
                "insert into enrollment_codes(id,secret_hash,scope,expires_at,consumed,revoked) values('old-code',?,'admin',now()+interval '30 minutes',false,false)",
                AuthService.hash("123456"));
        assertThatThrownBy(() -> auth.login("123456")).isInstanceOf(ApiException.class);
        assertThat(auth.login(ADMIN_CODE).sessionId()).isNotBlank();
        assertThat(jdbc.queryForObject("select count(*) from enrollment_codes", Integer.class))
                .isEqualTo(1);
        for (String value :
                java.util.List.of(
                        "",
                        "2005",
                        ADMIN_CODE.substring(1),
                        ADMIN_CODE + "x",
                        ADMIN_CODE.toUpperCase(java.util.Locale.ROOT),
                        ADMIN_CODE + " ")) {
            assertThatThrownBy(() -> auth.login(value)).isInstanceOf(ApiException.class);
        }
    }

    @Test
    void codeManagementEndpointsAreRemovedButSessionsRemainManageable() throws Exception {
        AuthService.LoginReply session = auth.login(ADMIN_CODE);
        Cookie cookie = new Cookie("cw-admin-dev", session.token());
        for (org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request :
                java.util.List.of(
                        get("/api/admin/codes"),
                        post("/api/admin/codes")
                                .contentType("application/json")
                                .content("{\"scope\":\"admin\"}"),
                        delete("/api/admin/codes/old-code"))) {
            assertThat(
                            mvc.perform(
                                            request.cookie(cookie)
                                                    .header("Origin", "http://localhost:8080")
                                                    .header("X-CSRF-Token", session.csrfToken()))
                                    .andReturn()
                                    .getResponse()
                                    .getStatus())
                    .isEqualTo(404);
        }
        assertThat(
                        mvc.perform(get("/api/admin/sessions").cookie(cookie))
                                .andReturn()
                                .getResponse()
                                .getStatus())
                .isEqualTo(200);
    }
}
