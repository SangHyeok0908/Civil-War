package cw.lcu;

import cw.contracts.ApiException;
import cw.contracts.MatchContracts.*;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/** Version 1 is provisional: only the observed complete custom SR tuple is supported. */
@Component
public class MatchNormalizer {
    private static final long MAX_SAFE = 9_007_199_254_740_991L;

    public NormalizedMatch normalizeMatch(JsonNode raw) {
        if (raw == null || !raw.isObject()) fail("rawMatch", "INVALID_TYPE");
        String platform = text(raw, "platformId", "platformId");
        if (!platform.matches("[A-Z0-9]{1,16}")) fail("platformId", "OUT_OF_RANGE");
        JsonNode id = required(raw, "gameId", "gameId");
        if (!id.isString() && !id.isIntegralNumber()) fail("gameId", "INVALID_TYPE");
        String gameId = id.isString() ? id.asString() : id.toString();
        if (!gameId.matches("[0-9]{1,30}")) fail("gameId", "OUT_OF_RANGE");
        long creation = number(raw, "gameCreation", "startedAtUtc", 1, 253402300799999L);
        long duration = number(raw, "gameDuration", "durationSeconds", 1, MAX_SAFE);
        String type = text(raw, "gameType", "gameType");
        if (!type.equals("CUSTOM_GAME")
                || !text(raw, "gameMode", "gameMode").equals("CLASSIC")
                || number(raw, "mapId", "mapId", 1, MAX_SAFE) != 11
                || number(raw, "queueId", "queueId", 0, MAX_SAFE) != 3130
                || !text(raw, "endOfGameResult", "endOfGameResult").equals("GameComplete"))
            throw new ApiException(422, "UNSUPPORTED_SCHEMA");
        String patch = text(raw, "gameVersion", "patch");
        JsonNode identities = array(raw, "participantIdentities", 10);
        JsonNode participants = array(raw, "participants", 10);
        JsonNode teams = array(raw, "teams", 2);
        Map<Long, String> puuids = new HashMap<>();
        Set<String> uniquePuuids = new HashSet<>();
        for (JsonNode identity : identities) {
            long pid =
                    number(
                            identity,
                            "participantId",
                            "participantIdentities.participantId",
                            1,
                            MAX_SAFE);
            String puuid =
                    text(
                            required(identity, "player", "participantIdentities.player"),
                            "puuid",
                            "participantIdentities.puuid");
            if (puuids.put(pid, puuid) != null || !uniquePuuids.add(puuid))
                fail("participantIdentities", "INVALID_MATCH");
        }
        Map<Integer, Boolean> wins = new HashMap<>();
        for (JsonNode team : teams) {
            int tid = teamId(team, "teams.teamId");
            String win = text(team, "win", "teams.win");
            if (!Set.of("Win", "Fail").contains(win) || wins.put(tid, win.equals("Win")) != null)
                fail("teams", "INVALID_MATCH");
        }
        if (new HashSet<>(wins.values()).size() != 2) fail("teams.win", "INVALID_MATCH");
        List<ParticipantRecord> records = new ArrayList<>();
        Set<Long> participantIds = new HashSet<>();
        Map<Integer, Integer> counts = new HashMap<>();
        for (int i = 0; i < participants.size(); i++) {
            JsonNode p = participants.get(i);
            String path = "participants." + i;
            long pid = number(p, "participantId", path + ".participantId", 1, MAX_SAFE);
            if (!participantIds.add(pid) || !puuids.containsKey(pid))
                fail(path + ".participantId", "INVALID_MATCH");
            int tid = teamId(p, path + ".teamId");
            counts.merge(tid, 1, Integer::sum);
            int champion =
                    (int) number(p, "championId", path + ".championId", 1, Integer.MAX_VALUE);
            JsonNode stats = required(p, "stats", path + ".stats");
            JsonNode win = required(stats, "win", path + ".win");
            if (!win.isBoolean()) fail(path + ".win", "INVALID_TYPE");
            if (!Objects.equals(wins.get(tid), win.asBoolean()))
                fail(path + ".win", "INVALID_MATCH");
            List<Long> items = new ArrayList<>();
            for (int slot = 0; slot < 7; slot++)
                items.add(number(stats, "item" + slot, path + ".items." + slot, 0, MAX_SAFE));
            records.add(
                    new ParticipantRecord(
                            puuids.get(pid),
                            tid,
                            win.asBoolean(),
                            champion,
                            stat(stats, "kills", path, "kills"),
                            stat(stats, "deaths", path, "deaths"),
                            stat(stats, "assists", path, "assists"),
                            stat(stats, "totalDamageDealtToChampions", path, "championDamage"),
                            stat(stats, "totalDamageTaken", path, "damageTaken"),
                            stat(stats, "totalMinionsKilled", path, "laneCs"),
                            stat(stats, "neutralMinionsKilled", path, "neutralCs"),
                            stat(stats, "goldEarned", path, "goldEarned"),
                            stat(stats, "visionScore", path, "visionScore"),
                            stat(stats, "damageDealtToObjectives", path, "objectiveDamage"),
                            stat(stats, "damageDealtToTurrets", path, "turretDamage"),
                            List.copyOf(items)));
        }
        if (counts.getOrDefault(100, 0) != 5 || counts.getOrDefault(200, 0) != 5)
            fail("participants.teamId", "INVALID_MATCH");
        return new NormalizedMatch(
                1,
                platform,
                gameId,
                Instant.ofEpochMilli(creation),
                duration,
                11,
                type,
                patch,
                List.copyOf(records));
    }

    private static long stat(JsonNode n, String key, String path, String name) {
        return number(n, key, path + "." + name, 0, MAX_SAFE);
    }

    private static int teamId(JsonNode n, String path) {
        long id = number(n, "teamId", path, 100, 200);
        if (id != 100 && id != 200) fail(path, "INVALID_MATCH");
        return (int) id;
    }

    private static JsonNode array(JsonNode n, String key, int count) {
        JsonNode a = required(n, key, key);
        if (!a.isArray()) fail(key, "INVALID_TYPE");
        if (a.size() != count) fail(key, "INVALID_MATCH");
        return a;
    }

    private static JsonNode required(JsonNode n, String key, String path) {
        JsonNode v = n == null ? null : n.get(key);
        if (v == null) fail(path, "REQUIRED");
        if (v.isNull()) fail(path, "INVALID_TYPE");
        return v;
    }

    private static String text(JsonNode n, String key, String path) {
        JsonNode v = required(n, key, path);
        if (!v.isString()) fail(path, "INVALID_TYPE");
        String s = v.asString();
        if (s.isBlank() || s.length() > 255) fail(path, "OUT_OF_RANGE");
        return s;
    }

    private static long number(JsonNode n, String key, String path, long min, long max) {
        JsonNode v = required(n, key, path);
        if (!v.isIntegralNumber()) fail(path, "INVALID_TYPE");
        var big = v.bigIntegerValue();
        if (big.compareTo(java.math.BigInteger.valueOf(min)) < 0
                || big.compareTo(java.math.BigInteger.valueOf(max)) > 0) fail(path, "OUT_OF_RANGE");
        return big.longValue();
    }

    private static void fail(String path, String code) {
        throw new MatchValidationError(List.of(new Issue(path, code)));
    }
}
