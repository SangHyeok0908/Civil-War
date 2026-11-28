package cw.riot;

import static org.assertj.core.api.Assertions.*;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import cw.contracts.AccountContracts.SoloRankLookup;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class HttpRiotGatewayTest {
    @Test
    void profileUsesSummonerEndpointAndValidatesTheIconNumber() throws Exception {
        AtomicInteger variant = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/",
                exchange -> {
                    assertThat(exchange.getRequestURI().getRawPath())
                            .isEqualTo("/lol/summoner/v4/summoners/by-puuid/official%2Fprofile");
                    assertThat(exchange.getRequestHeaders().getFirst("X-Riot-Token"))
                            .isEqualTo("test-secret");
                    assertThat(exchange.getRequestURI().getRawQuery()).isNull();
                    String body =
                            switch (variant.get()) {
                                case 0 -> "{\"profileIconId\":685}";
                                case 1 -> "{\"profileIconId\":0}";
                                case 2 -> "{\"profileIconId\":-1}";
                                default -> "{\"profileIconId\":\"685\"}";
                            };
                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(200, bytes.length);
                    exchange.getResponseBody().write(bytes);
                    exchange.close();
                });
        server.start();
        try {
            URI origin = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
            HttpRiotGateway gateway =
                    new HttpRiotGateway(
                            "test-secret", origin, origin, JsonMapper.builder().build());
            assertThat(gateway.getProfileIcon("official/profile").profileIconId()).isEqualTo(685);
            variant.set(1);
            assertThat(gateway.getProfileIcon("official/profile").profileIconId()).isZero();
            variant.set(2);
            assertThat(gateway.getProfileIcon("official/profile").status())
                    .isEqualTo("unavailable");
            variant.set(3);
            assertThat(gateway.getProfileIcon("official/profile").status())
                    .isEqualTo("unavailable");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void accountRateLimitStopsOtherMemberRequests() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/",
                exchange -> {
                    calls.incrementAndGet();
                    exchange.getResponseHeaders().add("Retry-After", "600");
                    exchange.sendResponseHeaders(429, -1);
                    exchange.close();
                });
        server.start();
        try {
            URI origin = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
            HttpRiotGateway gateway =
                    new HttpRiotGateway("test-key", origin, origin, JsonMapper.builder().build());
            assertThat(gateway.resolveAccount("First#test").retryAfterMillis()).isEqualTo(600000);
            assertThat(gateway.resolveAccount("Second#test").retryAfterMillis())
                    .isBetween(599000L, 600000L);
            gateway.getSoloRank("other-player");
            assertThat(calls.get()).isEqualTo(1);
        } finally {
            server.stop(0);
        }
    }

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
                    if (status.get() == 204) {
                        body = "[]";
                    }
                    if (status.get() == 429) {
                        exchange.getResponseHeaders().add("Retry-After", "12");
                    }
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
            HttpRiotGateway gateway =
                    new HttpRiotGateway(
                            "test-secret", origin, origin, JsonMapper.builder().build());
            assertThat(gateway.resolveAccount("한글친구#KR1").puuid()).isEqualTo("official-id");
            assertThat(gateway.getSoloRank("official-id").tier()).isEqualTo("GOLD");
            status.set(204);
            assertThat(gateway.getSoloRank("official-id").status()).isEqualTo("unranked");
            status.set(429);
            SoloRankLookup throttled = gateway.getSoloRank("official-id");
            assertThat(throttled.status()).isEqualTo("unavailable");
            assertThat(throttled.retryAfterMillis()).isEqualTo(12000);
        } finally {
            server.stop(0);
        }
    }

    private static HttpServer concurrentServer(HttpHandler handler) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.createContext("/", handler);
        server.start();
        return server;
    }

    private static void respond(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    @Test
    void requestsRunConcurrentlyUpToTheLimit() throws Exception {
        AtomicInteger inFlight = new AtomicInteger();
        AtomicInteger maxInFlight = new AtomicInteger();
        HttpServer server =
                concurrentServer(
                        exchange -> {
                            maxInFlight.accumulateAndGet(inFlight.incrementAndGet(), Math::max);
                            try {
                                Thread.sleep(300);
                            } catch (InterruptedException error) {
                                Thread.currentThread().interrupt();
                            }
                            inFlight.decrementAndGet();
                            respond(exchange, "[]");
                        });
        try {
            URI origin = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
            HttpRiotGateway gateway =
                    new HttpRiotGateway(
                            "key",
                            origin,
                            origin,
                            JsonMapper.builder().build(),
                            2,
                            Duration.ofSeconds(2));
            long started = System.nanoTime();
            List<Thread> threads = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                String id = "p" + i;
                threads.add(Thread.ofVirtual().start(() -> gateway.getSoloRank(id)));
            }
            for (Thread thread : threads) {
                thread.join();
            }
            long elapsedMillis = (System.nanoTime() - started) / 1_000_000;
            assertThat(maxInFlight.get()).isEqualTo(2);
            assertThat(elapsedMillis).isLessThan(1000);
        } finally {
            server.stop(0);
        }
    }

    @Test
    void tooManyRequestsBlocksConcurrentCallers() throws Exception {
        AtomicInteger serverHits = new AtomicInteger();
        HttpServer server =
                concurrentServer(
                        exchange -> {
                            serverHits.incrementAndGet();
                            exchange.getResponseHeaders().add("Retry-After", "60");
                            exchange.sendResponseHeaders(429, -1);
                            exchange.close();
                        });
        try {
            URI origin = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
            HttpRiotGateway gateway =
                    new HttpRiotGateway(
                            "key",
                            origin,
                            origin,
                            JsonMapper.builder().build(),
                            10,
                            Duration.ofSeconds(2));
            gateway.getSoloRank("first");
            List<SoloRankLookup> results = Collections.synchronizedList(new ArrayList<>());
            List<Thread> threads = new ArrayList<>();
            for (int i = 0; i < 5; i++) {
                String id = "p" + i;
                threads.add(Thread.ofVirtual().start(() -> results.add(gateway.getSoloRank(id))));
            }
            for (Thread thread : threads) {
                thread.join();
            }
            assertThat(results)
                    .hasSize(5)
                    .allSatisfy(r -> assertThat(r.status()).isEqualTo("unavailable"));
            assertThat(serverHits.get()).isEqualTo(1);
        } finally {
            server.stop(0);
        }
    }

    @Test
    void interruptedWaitForPermitReturnsUnavailable() throws Exception {
        HttpServer server =
                concurrentServer(
                        exchange -> {
                            try {
                                Thread.sleep(2000);
                            } catch (InterruptedException error) {
                                Thread.currentThread().interrupt();
                            }
                            respond(exchange, "[]");
                        });
        try {
            URI origin = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
            HttpRiotGateway gateway =
                    new HttpRiotGateway(
                            "key",
                            origin,
                            origin,
                            JsonMapper.builder().build(),
                            1,
                            Duration.ofSeconds(5));
            Thread first = Thread.ofVirtual().start(() -> gateway.getSoloRank("first"));
            Thread.sleep(200);
            SoloRankLookup[] second = new SoloRankLookup[1];
            long[] secondElapsedMillis = new long[1];
            Thread waiting =
                    Thread.ofVirtual()
                            .start(
                                    () -> {
                                        long started = System.nanoTime();
                                        second[0] = gateway.getSoloRank("second");
                                        secondElapsedMillis[0] =
                                                (System.nanoTime() - started) / 1_000_000;
                                    });
            Thread.sleep(100);
            waiting.interrupt();
            waiting.join();
            assertThat(second[0].status()).isEqualTo("unavailable");
            assertThat(secondElapsedMillis[0]).isLessThan(500);
            first.join();
        } finally {
            server.stop(0);
        }
    }

    @Test
    void puuidStateSeparatesAnotherKeysPuuidFromOtherFailures() throws Exception {
        AtomicInteger variant = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/",
                exchange -> {
                    assertThat(exchange.getRequestURI().getRawPath())
                            .isEqualTo("/riot/account/v1/accounts/by-puuid/stored%2Fpuuid");
                    assertThat(exchange.getRequestHeaders().getFirst("X-Riot-Token"))
                            .isEqualTo("test-secret");
                    int status = variant.get() == 0 ? 200 : variant.get() == 3 ? 500 : 400;
                    String body =
                            switch (variant.get()) {
                                case 0 ->
                                        "{\"puuid\":\"stored/puuid\",\"gameName\":\"A\",\"tagLine\":\"B\"}";
                                case 1 ->
                                        "{\"status\":{\"message\":\"Bad Request - Exception decrypting stored/puuid\",\"status_code\":400}}";
                                default ->
                                        "{\"status\":{\"message\":\"Bad Request\",\"status_code\":400}}";
                            };
                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(status, bytes.length);
                    exchange.getResponseBody().write(bytes);
                    exchange.close();
                });
        server.start();
        try {
            URI origin = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
            HttpRiotGateway gateway =
                    new HttpRiotGateway(
                            "test-secret", origin, origin, JsonMapper.builder().build());
            assertThat(gateway.puuidState("stored/puuid")).isEqualTo("valid");
            variant.set(1);
            assertThat(gateway.puuidState("stored/puuid")).isEqualTo("foreign_key");
            variant.set(2);
            assertThat(gateway.puuidState("stored/puuid")).isEqualTo("unavailable");
            variant.set(3);
            assertThat(gateway.puuidState("stored/puuid")).isEqualTo("unavailable");
        } finally {
            server.stop(0);
        }
    }
}
