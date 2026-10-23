package cw.auth;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import cw.support.DatabaseTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.*;

@AutoConfigureMockMvc(print = org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint.NONE)
@Import(ErrorHandlingIntegrationTest.FaultEndpoint.class)
class ErrorHandlingIntegrationTest extends DatabaseTestSupport {
    @Autowired MockMvc mvc;

    @RestController
    static class FaultEndpoint {
        @GetMapping("/api/test-only-failure")
        public Object fail() {
            throw new IllegalStateException("private-exception-sentinel");
        }
    }

    @Test
    void unexpectedFailuresHavePrivateRetryableEnvelope() throws Exception {
        var response = mvc.perform(get("/api/test-only-failure")).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(500);
        assertThat(json.readTree(response.getContentAsString()).get("retryable").asBoolean())
                .isTrue();
        assertThat(response.getContentAsString())
                .contains("INTERNAL_ERROR")
                .doesNotContain("private-exception-sentinel", "IllegalStateException");
    }

    @Test
    void frameworkErrorsHaveStructuredClientEnvelope() throws Exception {
        var missing = mvc.perform(get("/api/missing-route")).andReturn().getResponse();
        assertThat(missing.getStatus()).isEqualTo(404);
        assertThat(missing.getContentAsString()).contains("NOT_FOUND", "retryable");
        var type =
                mvc.perform(
                                post("/api/collector/enroll")
                                        .contentType("text/plain")
                                        .content("private-input-sentinel"))
                        .andReturn()
                        .getResponse();
        assertThat(type.getStatus()).isEqualTo(415);
        assertThat(type.getContentAsString())
                .contains("INVALID_REQUEST")
                .doesNotContain("private-input-sentinel");
    }
}
