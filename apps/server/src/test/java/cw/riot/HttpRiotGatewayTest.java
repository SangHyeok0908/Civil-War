package cw.riot;

import static org.assertj.core.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class HttpRiotGatewayTest {
    @Test
    void sendsKeyInHeaderAndSelectsSoloInsteadOfFlex() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicInteger status = new AtomicInteger(200);
        server.createContext(
                "/",
                exchange -> {
                    boolean secure =
                            "test-secret"
                                            .equals(
                                                    exchange.getRequestHeaders()
                                                            .getFirst("X-Riot-Token"))
                                    && exchange.getRequestURI().getRawQuery() == null;
                    String body =
                            exchange.getRequestURI().getPath().startsWith("/riot/account/")
                                    ? "{\"puuid\":\"official-id\",\"gameName\":\"한글친구\",\"tagLine\":\"KR1\"}"
                                    : "[{\"queueType\":\"RANKED_FLEX_SR\",\"tier\":\"CHALLENGER\",\"rank\":\"I\"},{\"queueType\":\"RANKED_SOLO_5x5\",\"tier\":\"GOLD\",\"rank\":\"I\"}]";
                    if (status.get() == 204) body = "[]";
                    if (status.get() == 429) exchange.getResponseHeaders().add("Retry-After", "12");
                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(
                            secure ? (status.get() == 204 ? 200 : status.get()) : 403,
                            bytes.length);
                    exchange.getResponseBody().write(bytes);
                    exchange.close();
                });
        server.start();
        try {
            URI origin = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
            var gateway =
                    new HttpRiotGateway(
                            "test-secret", origin, origin, JsonMapper.builder().build());
            assertThat(gateway.resolveAccount("한글친구#KR1").puuid()).isEqualTo("official-id");
            assertThat(gateway.getSoloRank("official-id").tier()).isEqualTo("GOLD");
            status.set(204);
            assertThat(gateway.getSoloRank("official-id").status()).isEqualTo("unranked");
            status.set(429);
            assertThat(gateway.getSoloRank("official-id").status()).isEqualTo("unavailable");
            assertThat(gateway.getSoloRank("official-id").retryAfterMillis()).isEqualTo(12000);
        } finally {
            server.stop(0);
        }
    }
}
