package cw.lcu;

import cw.contracts.MatchContracts.RoleSuggestion;
import cw.contracts.Role;
import java.util.*;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

@Component
public class MatchRoleHints {
    public List<RoleSuggestion> suggest(JsonNode raw) {
        Map<Integer, String> identities = new HashMap<>();
        for (var i : raw.path("participantIdentities"))
            identities.put(
                    i.path("participantId").asInt(), i.path("player").path("puuid").asString());
        record Candidate(String puuid, int team, Role role) {}
        List<Candidate> rows = new ArrayList<>();
        for (var p : raw.path("participants")) {
            String position = p.path("teamPosition").asString(null);
            if (position == null) position = p.path("stats").path("teamPosition").asString(null);
            Role direct = null;
            try {
                direct = Role.valueOf(position);
            } catch (Exception ignored) {
            }
            String lane = p.path("timeline").path("lane").asString("").toUpperCase(Locale.ROOT),
                    role = p.path("timeline").path("role").asString("").toUpperCase(Locale.ROOT);
            Role pair =
                    switch (lane) {
                        case "TOP" -> role.equals("SOLO") ? Role.TOP : null;
                        case "MID", "MIDDLE" -> role.equals("SOLO") ? Role.MIDDLE : null;
                        case "JUNGLE" ->
                                Set.of("NONE", "JUNGLE").contains(role) ? Role.JUNGLE : null;
                        case "BOTTOM" ->
                                Set.of("DUO_CARRY", "CARRY").contains(role)
                                        ? Role.BOTTOM
                                        : Set.of("DUO_SUPPORT", "SUPPORT").contains(role)
                                                ? Role.UTILITY
                                                : null;
                        default -> null;
                    };
            rows.add(
                    new Candidate(
                            identities.get(p.path("participantId").asInt()),
                            p.path("teamId").asInt(),
                            direct != null && pair != null && direct != pair
                                    ? null
                                    : direct != null ? direct : pair));
        }
        return rows.stream()
                .map(
                        p -> {
                            boolean conflict =
                                    p.role() != null
                                            && rows.stream()
                                                            .filter(
                                                                    q ->
                                                                            p.team() == q.team()
                                                                                    && p.role()
                                                                                            == q
                                                                                                    .role())
                                                            .count()
                                                    > 1;
                            Role role = conflict ? null : p.role();
                            return new RoleSuggestion(
                                    p.puuid(),
                                    role,
                                    role == null ? "none" : "match",
                                    conflict
                                            ? "duplicate_role"
                                            : role == null
                                                    ? "insufficient_evidence"
                                                    : "explicit_match_evidence");
                        })
                .toList();
    }
}
