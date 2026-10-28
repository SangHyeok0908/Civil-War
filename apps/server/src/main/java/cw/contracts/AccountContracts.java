package cw.contracts;

import java.time.Instant;

public final class AccountContracts {
    private AccountContracts() {}

    public record IdentityObservation(
            String puuid, String riotId, String source, Instant observedAt) {}

    public record AccountLookup(String status, String puuid, String riotId) {}

    public record SoloRankLookup(
            String status, String tier, String division, long retryAfterMillis) {}

    public record RankSeedSnapshot(
            double teamSeed, String status, String tier, String division, Instant observedAt) {}

    public static String riotId(String value) {
        if (value == null) {
            throw new ApiException(422, "INVALID_RIOT_ID");
        }
        String cleaned = value.strip();
        int hash = cleaned.indexOf('#');
        if (cleaned.length() > 100
                || hash < 1
                || hash != cleaned.lastIndexOf('#')
                || hash == cleaned.length() - 1
                || cleaned.codePoints().anyMatch(Character::isISOControl)
                || !cleaned.substring(hash + 1).equals(cleaned.substring(hash + 1).strip())) {
            throw new ApiException(422, "INVALID_RIOT_ID");
        }
        return cleaned;
    }
}
