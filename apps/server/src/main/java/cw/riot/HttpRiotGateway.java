package cw.riot;

import cw.contracts.AccountContracts;
import cw.contracts.AccountContracts.AccountLookup;
import cw.contracts.AccountContracts.ProfileIconLookup;
import cw.contracts.AccountContracts.SoloRankLookup;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
public class HttpRiotGateway implements RiotGateway {
    private final String key;
    private final URI accountOrigin, platformOrigin;
    private final JsonMapper json;
    private final AtomicLong retryNotBefore = new AtomicLong();
    private final Semaphore permits;
    private final Duration requestTimeout;

    private record Response(int statusCode, String body, long retryAfterMillis) {}

    private final HttpClient client =
            HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(3))
                    .followRedirects(HttpClient.Redirect.NEVER)
                    .build();

    @Autowired
    public HttpRiotGateway(
            @Value("${RIOT_API_KEY:}") String key,
            @Value("${cw.riot.account-origin:https://asia.api.riotgames.com}") String accountOrigin,
            @Value("${cw.riot.platform-origin:https://kr.api.riotgames.com}") String platformOrigin,
            JsonMapper json,
            @Value("${cw.riot.max-concurrent-requests:10}") int maxConcurrentRequests,
            @Value("${cw.riot.request-timeout-ms:4000}") long requestTimeoutMillis) {
        this(
                key,
                URI.create(accountOrigin),
                URI.create(platformOrigin),
                json,
                maxConcurrentRequests,
                Duration.ofMillis(requestTimeoutMillis));
    }

    public HttpRiotGateway(String key, URI accountOrigin, URI platformOrigin, JsonMapper json) {
        this(key, accountOrigin, platformOrigin, json, 10, Duration.ofMillis(4000));
    }

    public HttpRiotGateway(
            String key,
            URI accountOrigin,
            URI platformOrigin,
            JsonMapper json,
            int maxConcurrentRequests,
            Duration requestTimeout) {
        this.key = key;
        this.accountOrigin = origin(accountOrigin);
        this.platformOrigin = origin(platformOrigin);
        this.json = json;
        this.permits = new Semaphore(maxConcurrentRequests, true);
        this.requestTimeout = requestTimeout;
    }

    private static URI origin(URI uri) {
        boolean local =
                "http".equals(uri.getScheme())
                        && ("127.0.0.1".equals(uri.getHost()) || "localhost".equals(uri.getHost()));
        if (!("https".equals(uri.getScheme()) || local)
                || uri.getUserInfo() != null
                || uri.getRawQuery() != null
                || uri.getFragment() != null
                || uri.getHost() == null) {
            throw new IllegalArgumentException("Invalid Riot origin");
        }
        return uri;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private Response get(URI origin, String path) {
        Response blocked = blocked();
        if (blocked != null || key.isBlank()) {
            return blocked;
        }
        try {
            permits.acquire();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            return null;
        }
        try {
            // Another caller may have received 429 while this one waited for a permit.
            blocked = blocked();
            return blocked != null ? blocked : send(origin, path);
        } finally {
            permits.release();
        }
    }

    private Response blocked() {
        long now = System.currentTimeMillis(), until = retryNotBefore.get();
        return until > now ? new Response(429, "", until - now) : null;
    }

    private Response send(URI origin, String path) {
        try {
            HttpResponse<String> response =
                    client.send(
                            HttpRequest.newBuilder(origin.resolve(path))
                                    .timeout(requestTimeout)
                                    .header("X-Riot-Token", key)
                                    .header("Accept", "application/json")
                                    .GET()
                                    .build(),
                            HttpResponse.BodyHandlers.ofString());
            long retry = 0;
            String header = response.headers().firstValue("Retry-After").orElse("0");
            try {
                retry = Math.multiplyExact(Long.parseLong(header), 1000);
            } catch (RuntimeException ignored) {
                try {
                    retry =
                            java.time.ZonedDateTime.parse(
                                                    header,
                                                    java.time.format.DateTimeFormatter
                                                            .RFC_1123_DATE_TIME)
                                            .toInstant()
                                            .toEpochMilli()
                                    - System.currentTimeMillis();
                } catch (RuntimeException invalidDate) {
                    retry = 0;
                }
            }
            if (response.statusCode() == 429) {
                retry = retry > 0 ? retry : cw.domain.RankSeedPolicy.failureBackoffMillis();
                retryNotBefore.accumulateAndGet(
                        Math.addExact(System.currentTimeMillis(), retry), Math::max);
            }
            return new Response(response.statusCode(), response.body(), Math.max(0, retry));
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            return null;
        } catch (Exception error) {
            return null;
        }
    }

    @Override
    public AccountLookup resolveAccount(String riotId) {
        String id = AccountContracts.riotId(riotId);
        int hash = id.lastIndexOf('#');
        Response response =
                get(
                        accountOrigin,
                        "/riot/account/v1/accounts/by-riot-id/"
                                + encode(id.substring(0, hash))
                                + "/"
                                + encode(id.substring(hash + 1)));
        if (response != null && response.statusCode() == 404) {
            return new AccountLookup("not_found", null, id);
        }
        if (response == null || response.statusCode() != 200) {
            return new AccountLookup(
                    "unavailable", null, id, response == null ? 0 : response.retryAfterMillis());
        }
        try {
            JsonNode data = json.readTree(response.body());
            if (!data.path("puuid").isString()
                    || data.path("puuid").asString().isBlank()
                    || !data.path("gameName").isString()
                    || !data.path("tagLine").isString()) {
                throw new IllegalArgumentException();
            }
            String canonical =
                    AccountContracts.riotId(
                            data.get("gameName").asString() + "#" + data.get("tagLine").asString());
            if (!canonical.equalsIgnoreCase(id)) {
                throw new IllegalArgumentException();
            }
            return new AccountLookup("verified", data.get("puuid").asString(), canonical);
        } catch (Exception error) {
            return new AccountLookup("unavailable", null, id);
        }
    }

    @Override
    public ProfileIconLookup getProfileIcon(String officialPuuid) {
        Response response =
                get(platformOrigin, "/lol/summoner/v4/summoners/by-puuid/" + encode(officialPuuid));
        if (response == null || response.statusCode() != 200) {
            return new ProfileIconLookup(
                    "unavailable", null, response == null ? 0 : response.retryAfterMillis());
        }
        try {
            JsonNode icon = json.readTree(response.body()).path("profileIconId");
            if (!icon.isIntegralNumber() || !icon.canConvertToInt() || icon.asInt() < 0) {
                throw new IllegalArgumentException();
            }
            return new ProfileIconLookup("available", icon.asInt(), 0);
        } catch (Exception error) {
            return new ProfileIconLookup("unavailable", null, 0);
        }
    }

    @Override
    public SoloRankLookup getSoloRank(String officialPuuid) {
        Response response =
                get(platformOrigin, "/lol/league/v4/entries/by-puuid/" + encode(officialPuuid));
        if (response == null || response.statusCode() != 200) {
            return new SoloRankLookup(
                    "unavailable", null, null, response == null ? 0 : response.retryAfterMillis());
        }
        try {
            JsonNode values = json.readTree(response.body());
            if (!values.isArray()) {
                throw new IllegalArgumentException();
            }
            for (JsonNode value : values) {
                if ("RANKED_SOLO_5x5".equals(value.path("queueType").asString())) {
                    String tier = value.path("tier").asString(),
                            division = value.path("rank").asString();
                    cw.domain.RankSeedPolicy.toSeed(tier, division);
                    return new SoloRankLookup("ranked", tier, division, 0);
                }
            }
            return new SoloRankLookup("unranked", null, null, 0);
        } catch (Exception error) {
            return new SoloRankLookup("unavailable", null, null, 0);
        }
    }

    @Override
    public String puuidState(String officialPuuid) {
        Response response =
                get(accountOrigin, "/riot/account/v1/accounts/by-puuid/" + encode(officialPuuid));
        if (response == null) {
            return "unavailable";
        }
        if (response.statusCode() == 200) {
            return "valid";
        }
        // Riot answers 400 "Exception decrypting ..." for a PUUID issued under another API key.
        return response.statusCode() == 400 && response.body().contains("decrypting")
                ? "foreign_key"
                : "unavailable";
    }
}
