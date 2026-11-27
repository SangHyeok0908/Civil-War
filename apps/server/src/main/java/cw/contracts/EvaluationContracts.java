package cw.contracts;

import cw.contracts.AccountContracts.RankSeedSnapshot;
import cw.contracts.MatchContracts.NormalizedMatch;
import cw.contracts.MatchContracts.ParticipantRecord;
import cw.contracts.MemberContracts.Member;
import cw.domain.RankSeedPolicy;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import tools.jackson.databind.JsonNode;

/**
 * Versioned evaluation and recommendation wire models; public scores contain no private identity or
 * seed.
 */
public final class EvaluationContracts {
    private EvaluationContracts() {}

    public record EvaluableParticipant(
            String playerId, String memberId, Role role, ParticipantRecord record) {
        public EvaluableParticipant(String memberId, Role role, ParticipantRecord record) {
            this(memberId, memberId, role, record);
        }
    }

    public record EvaluableMatch(NormalizedMatch match, List<EvaluableParticipant> participants) {}

    public record ScoringRuleSet(
            String id,
            String algorithmVersion,
            Map<Role, Map<String, Double>> weightsByRole,
            JsonNode metricMix,
            JsonNode normalization,
            int cumulativePrior) {}

    public record EvaluationInput(
            long sourceRevision,
            String scoringVersion,
            ScoringRuleSet rules,
            List<EvaluableMatch> matches,
            List<Member> members) {}

    public record GameScore(
            String matchKey,
            String playerId,
            String memberId,
            Role role,
            String scoringVersion,
            double score,
            int rank,
            Map<String, Double> breakdown) {
        public GameScore(
                String matchKey,
                String memberId,
                Role role,
                String scoringVersion,
                double score,
                int rank,
                Map<String, Double> breakdown) {
            this(matchKey, memberId, memberId, role, scoringVersion, score, rank, breakdown);
        }
    }

    public record RoleSkill(String memberId, Role role, double value, int n) {}

    /** One member's solo-rank input for a team recommendation and where it came from. */
    public record RankLookup(
            String memberId,
            String source,
            String status,
            double teamSeed,
            String tier,
            String division,
            Instant observedAt) {
        public static RankLookup of(String memberId, RankSeedSnapshot value, String status) {
            if ("ranked".equals(status) || "unranked".equals(status)) {
                return new RankLookup(
                        memberId,
                        "live",
                        status,
                        value.teamSeed(),
                        value.tier(),
                        value.division(),
                        value.observedAt());
            }
            if (value.observedAt() != null) {
                return new RankLookup(
                        memberId,
                        "saved",
                        status,
                        value.teamSeed(),
                        value.tier(),
                        value.division(),
                        value.observedAt());
            }
            return new RankLookup(
                    memberId, "default", status, RankSeedPolicy.neutral(), null, null, null);
        }
    }

    public record MemberStats(
            String memberId,
            int games,
            int wins,
            int losses,
            long kills,
            long deaths,
            long assists,
            Double kda,
            Double adjustedScore,
            Integer rank,
            String status,
            double winRate,
            boolean perfect,
            Map<Role, RecordStats> byRole,
            Map<Integer, RecordStats> byChampion) {}

    public record RecordStats(
            int games,
            int wins,
            int losses,
            long kills,
            long deaths,
            long assists,
            Double kda,
            boolean perfect) {}

    /** Generations stored before role skills moved to request time may still carry roleSkills. */
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public record EvaluationGeneration(
            String id,
            long sourceRevision,
            String scoringVersion,
            List<GameScore> gameScores,
            List<MemberStats> memberStats) {}

    public record TeamSeat(String memberId, Role role) {}

    public record TeamCandidate(
            List<TeamSeat> teamA, List<TeamSeat> teamB, double skillDifference) {}

    public record TeamRecommendation(
            List<TeamCandidate> candidates,
            String reason,
            long sourceRevision,
            List<RankLookup> rankLookups) {
        public TeamRecommendation withRankLookups(List<RankLookup> values) {
            return new TeamRecommendation(candidates, reason, sourceRevision, List.copyOf(values));
        }
    }
}
