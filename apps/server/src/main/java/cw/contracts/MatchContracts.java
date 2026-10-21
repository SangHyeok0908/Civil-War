package cw.contracts;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import tools.jackson.databind.JsonNode;

public final class MatchContracts {
    private MatchContracts() {}
    public record ParticipantRecord(String puuid, int teamId, boolean win, int championId,
            long kills, long deaths, long assists, long championDamage, long damageTaken,
            long laneCs, long neutralCs, long goldEarned, long visionScore,
            long objectiveDamage, long turretDamage, List<Long> items) {}
    public record NormalizedMatch(int schemaVersion, String platformId, String gameId,
            Instant startedAtUtc, long durationSeconds, int mapId, String gameType,
            String patch, List<ParticipantRecord> participants) {
        public String matchKey() { return platformId + ":" + gameId; }
    }
    public record IngestMatchInput(JsonNode rawMatch, String clientSubmissionId, int schemaVersion) {}
    public record IngestMatchAck(String matchKey, String state, String disposition) {}
    public record ConfirmationInput(String matchKey, Map<String,Role> rolesByPuuid, String clientSubmissionId) {}
    public record RegistrationAck(String matchKey, String disposition, long sourceRevision) {}
    public record CollectorMatch(String matchKey, String state, NormalizedMatch match, Map<String,Role> confirmedRoles) {}
    public record CollectorPrincipal(String memberId, String credentialId, String puuid) {}
    public record Issue(String path, String code) {}
    public record ValidationResult(boolean ok, List<Issue> issues) {}
}
