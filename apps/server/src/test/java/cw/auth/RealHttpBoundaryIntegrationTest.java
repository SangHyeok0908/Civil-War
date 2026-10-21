package cw.auth;
import cw.support.DatabaseTestSupport;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.TestPropertySource;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties="cw.dev-http=false")
class RealHttpBoundaryIntegrationTest extends DatabaseTestSupport {
    @LocalServerPort int port;
    @Autowired AuthService auth;
    @Test void realChunkedRequestWithoutLengthIsCapped() throws Exception {
        byte[] bytes=new byte[ApiSecurityFilter.MAX_BODY_BYTES+1]; java.util.Arrays.fill(bytes,(byte)'x');
        var publisher=HttpRequest.BodyPublishers.ofInputStream(()->new ByteArrayInputStream(bytes));
        assertThat(publisher.contentLength()).isEqualTo(-1);
        try(var client=HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build()) {
            var req=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/collector/enroll")).timeout(Duration.ofSeconds(5))
                .header("Content-Type","application/json").POST(publisher).build();
            var response=client.send(req,HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(413); assertThat(response.body()).contains("BODY_TOO_LARGE");
        }
    }
    @Test void productionCookieHasHostProtection() throws Exception {
        var code=auth.issueCode("admin",null,"test");
        try(var client=HttpClient.newHttpClient()) {
            var req=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/admin/session")).timeout(Duration.ofSeconds(5))
                .header("Origin","http://localhost:8080").header("Content-Type","application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(Map.of("code",code.code())))).build();
            var response=client.send(req,HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(response.headers().firstValue("Set-Cookie").orElseThrow()).contains("__Host-cw-admin=","Secure","HttpOnly","SameSite=Strict","Path=/").doesNotContain("Domain=");
        }
    }
}
