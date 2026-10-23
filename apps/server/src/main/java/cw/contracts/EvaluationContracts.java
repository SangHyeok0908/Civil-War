package cw.contracts;

import cw.contracts.MatchContracts.NormalizedMatch;
import cw.contracts.MatchContracts.ParticipantRecord;
import cw.contracts.MemberContracts.Member;
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

    public record RoleReferenceSample(
            String puuid,
            String source,
            String gameId,
            Instant playedAt,
            Role role,
            JsonNode evidence) {}

    public record EvaluableParticipant(String memberId, Role role, ParticipantRecord record) {}

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
            String memberId,
            Role role,
            String scoringVersion,
            double score,
            int rank,
            Map<String, Double> breakdown) {}

    public record RoleSkill(String memberId, Role role, double value, int n) {}

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

    public record EvaluationGeneration(
            String id,
            long sourceRevision,
            String scoringVersion,
            List<GameScore> gameScores,
            List<MemberStats> memberStats,
            List<RoleSkill> roleSkills) {}

    public record TeamSeat(String memberId, Role role) {}

    public record TeamCandidate(
            List<TeamSeat> teamA, List<TeamSeat> teamB, double skillDifference) {}

    public record TeamRecommendation(
            List<TeamCandidate> candidates, String reason, long sourceRevision) {}
}
