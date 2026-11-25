package cw.domain;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

public final class RankSeedPolicy {
    private static final JsonNode POLICY = load();

    private RankSeedPolicy() {}

    private static JsonNode load() {
        try (InputStream input =
                RankSeedPolicy.class.getResourceAsStream("/policies/rank-seed-v1.json")) {
            return JsonMapper.builder().build().readTree(input);
        } catch (Exception error) {
            throw new IllegalStateException("Rank policy unavailable", error);
        }
    }

    private static List<String> values(String field) {
        List<String> values = new ArrayList<>();
        POLICY.get(field).forEach(v -> values.add(v.asString()));
        return values;
    }

    public static long failureBackoffMillis() {
        return POLICY.get("failureBackoffMillis").asLong();
    }

    public static double neutral() {
        return POLICY.get("neutral").asDouble();
    }

    public static double toSeed(String tier, String division) {
        List<String> divided = values("dividedTiers"),
                divisions = values("divisions"),
                top = values("topTiers");
        int index;
        if (divided.contains(tier) && divisions.contains(division)) {
            index = divided.indexOf(tier) * divisions.size() + divisions.indexOf(division);
        } else if (top.contains(tier)) {
            index = divided.size() * divisions.size() + top.indexOf(tier);
        } else {
            throw new IllegalArgumentException("Unknown ranked tier");
        }
        int last = divided.size() * divisions.size() + top.size() - 1;
        return Math.round(POLICY.get("maximum").asDouble() * index / last);
    }
}
