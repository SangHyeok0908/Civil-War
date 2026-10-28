package cw.riot;

import cw.contracts.AccountContracts;
import cw.contracts.AccountContracts.AccountLookup;
import cw.contracts.AccountContracts.SoloRankLookup;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
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
            JsonMapper json) {
        this(key, URI.create(accountOrigin), URI.create(platformOrigin), json);
    }

    public HttpRiotGateway(String key, URI accountOrigin, URI platformOrigin, JsonMapper json) {
        this.key = key;
        this.accountOrigin = origin(accountOrigin);
        this.platformOrigin = origin(platformOrigin);
        this.json = json;
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

    private HttpResponse<String> get(URI origin, String path) {
        if (key.isBlank()) {
            return null;
        }
        try {
            return client.send(
                    HttpRequest.newBuilder(origin.resolve(path))
                            .timeout(Duration.ofSeconds(5))
                            .header("X-Riot-Token", key)
                            .header("Accept", "application/json")
                            .GET()
                            .build(),
                    HttpResponse.BodyHandlers.ofString());
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
        java.net.http.HttpResponse<String> response =
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
            return new AccountLookup("unavailable", null, id);
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
    public SoloRankLookup getSoloRank(String officialPuuid) {
        java.net.http.HttpResponse<String> response =
                get(platformOrigin, "/lol/league/v4/entries/by-puuid/" + encode(officialPuuid));
        if (response == null || response.statusCode() != 200) {
            long retry = 0;
            if (response != null) {
                try {
                    retry =
                            Math.multiplyExact(
                                    Long.parseLong(
                                            response.headers()
                                                    .firstValue("Retry-After")
                                                    .orElse("0")),
                                    1000);
                } catch (RuntimeException ignored) {
                    retry = 0;
                }
            }
            return new SoloRankLookup("unavailable", null, null, Math.max(0, retry));
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
}
