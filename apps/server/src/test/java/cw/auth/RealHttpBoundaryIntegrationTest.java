package cw.auth;

import static org.assertj.core.api.Assertions.*;

import cw.auth.AuthService.CodeReply;
import cw.support.DatabaseTestSupport;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublisher;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = "cw.dev-http=false")
class RealHttpBoundaryIntegrationTest extends DatabaseTestSupport {
    @LocalServerPort int port;
    @Autowired AuthService auth;

    @Test
    void realChunkedRequestWithoutLengthIsCapped() throws Exception {
        byte[] bytes = new byte[ApiSecurityFilter.MAX_BODY_BYTES + 1];
        Arrays.fill(bytes, (byte) 'x');

        BodyPublisher publisher =
                HttpRequest.BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(bytes));
        assertThat(publisher.contentLength()).isEqualTo(-1);

        try (HttpClient client =
                HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build()) {
            HttpRequest req =
                    HttpRequest.newBuilder(
                                    URI.create(
                                            "http://localhost:" + port + "/api/collector/enroll"))
                            .timeout(Duration.ofSeconds(5))
                            .header("Content-Type", "application/json")
                            .POST(publisher)
                            .build();
            HttpResponse<String> response = client.send(req, HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(413);
            assertThat(response.body()).contains("BODY_TOO_LARGE");
        }
    }

    @Test
    void realEncodedAndMatrixPathsRemainProtected() throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            for (String path :
                    List.of(
                            "/api/admin;ignored/members",
                            "/api/admin%3Bignored/members",
                            "/api/admin%3bignored/members",
                            "/api/%61dmin/members",
                            "/api/collector;ignored/members",
                            "/api/%63ollector/members",
                            "//api/admin/members",
                            "/api//admin/members",
                            "/api/admin//members",
                            "/api/x/../admin/members",
                            "/api/../api/admin/members",
                            "/api/admin/./members",
                            "/api/%2e/admin/members",
                            "/api/x/%2e%2e/admin/members",
                            "/api%2fadmin/members",
                            "/api/%2Fadmin/members",
                            "/api%5cadmin/members",
                            "/api/%252fadmin/members")) {
                HttpRequest req =
                        HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                                .timeout(Duration.ofSeconds(5))
                                .GET()
                                .build();
                HttpResponse<String> response =
                        client.send(req, HttpResponse.BodyHandlers.ofString());
                assertThat(response.statusCode()).as(path).isIn(400, 401, 403, 404);
                assertThat(response.body()).doesNotContain("fixture-player");
            }
        }
    }

    @Test
    void encodedMatchKeyColonWorksForCollectorAndPublicRequests() throws Exception {
        ingest.ingestMatch(input(), actor(1));

        CodeReply code = auth.issueCode("collector", "member-1", "test");
        String token = auth.enroll(code.code(), actor(1).puuid()).token();
        String encodedKey = KEY.replace(":", "%3A");

        try (HttpClient client = HttpClient.newHttpClient()) {
            HttpRequest confirm =
                    HttpRequest.newBuilder(
                                    URI.create(
                                            "http://localhost:"
                                                    + port
                                                    + "/api/collector/matches/"
                                                    + encodedKey
                                                    + "/confirm"))
                            .timeout(Duration.ofSeconds(5))
                            .header("Authorization", "Bearer " + token)
                            .header("Content-Type", "application/json")
                            .POST(
                                    HttpRequest.BodyPublishers.ofString(
                                            json.writeValueAsString(
                                                    Map.of(
                                                            "rolesByPuuid",
                                                            roles(false),
                                                            "clientSubmissionId",
                                                            "encoded-key"))))
                            .build();
            assertThat(client.send(confirm, HttpResponse.BodyHandlers.ofString()).statusCode())
                    .isEqualTo(200);

            for (String prefix : List.of("/api/collector/matches/", "/api/matches/")) {
                HttpRequest request =
                        HttpRequest.newBuilder(
                                        URI.create(
                                                "http://localhost:" + port + prefix + encodedKey))
                                .timeout(Duration.ofSeconds(5))
                                .header("Authorization", "Bearer " + token)
                                .GET()
                                .build();
                HttpResponse<String> response =
                        client.send(request, HttpResponse.BodyHandlers.ofString());
                assertThat(response.statusCode()).isEqualTo(200);
                assertThat(json.readTree(response.body()).get("matchKey").asString())
                        .isEqualTo(KEY);
            }
        }
    }

    @Test
    void productionCookieHasHostProtection() throws Exception {
        CodeReply code = auth.issueCode("admin", null, "test");

        try (HttpClient client = HttpClient.newHttpClient()) {
            HttpRequest req =
                    HttpRequest.newBuilder(
                                    URI.create("http://localhost:" + port + "/api/admin/session"))
                            .timeout(Duration.ofSeconds(5))
                            .header("Origin", "http://localhost:8080")
                            .header("Content-Type", "application/json")
                            .POST(
                                    HttpRequest.BodyPublishers.ofString(
                                            json.writeValueAsString(Map.of("code", code.code()))))
                            .build();
            HttpResponse<String> response = client.send(req, HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(response.headers().firstValue("Set-Cookie").orElseThrow())
                    .contains("__Host-cw-admin=", "Secure", "HttpOnly", "SameSite=Strict", "Path=/")
                    .doesNotContain("Domain=");
        }
    }
}
