package cw.domain;

import cw.contracts.EvaluationContracts.EvaluableMatch;
import cw.contracts.EvaluationContracts.EvaluableParticipant;
import cw.contracts.EvaluationContracts.ScoringRuleSet;
import cw.contracts.MatchContracts.ParticipantRecord;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class MatchFeatures {
    private MatchFeatures() {}

    public record Row(String matchKey, EvaluableParticipant participant, double[] metrics) {}

    public static List<Row> extract(List<EvaluableMatch> matches, ScoringRuleSet rules) {
        List<Row> rows = new ArrayList<>();
        Set<String> keys = new HashSet<>();

        for (EvaluableMatch game : matches) {
            if (game.match().durationSeconds() <= 0
                    || game.participants().size() != 10
                    || !keys.add(game.match().matchKey())) {
                throw new IllegalArgumentException("Invalid evaluation match");
            }

            Set<String> ids = new HashSet<>();

            for (int team : List.of(100, 200)) {
                List<EvaluableParticipant> ps =
                        game.participants().stream()
                                .filter(p -> p.record().teamId() == team)
                                .toList();

                if (ps.size() != 5
                        || ps.stream().anyMatch(p -> p.role() == null)
                        || ps.stream().map(EvaluableParticipant::role).distinct().count() != 5) {
                    throw new IllegalArgumentException("Unconfirmed roles");
                }
            }

            double minutes = game.match().durationSeconds() / 60.;

            for (EvaluableParticipant p : game.participants()) {
                if (!ids.add(p.memberId())) {
                    throw new IllegalArgumentException("Duplicate member");
                }

                ParticipantRecord r = p.record();
                double teamKills =
                        game.participants().stream()
                                .filter(q -> q.record().teamId() == r.teamId())
                                .mapToDouble(q -> q.record().kills())
                                .sum();
                double teamDamage =
                        game.participants().stream()
                                .filter(q -> q.record().teamId() == r.teamId())
                                .mapToDouble(q -> q.record().championDamage())
                                .sum();
                double[] metrics = {
                    r.championDamage() / minutes,
                    ratio(r.championDamage(), teamDamage),
                    ((double) r.laneCs() + r.neutralCs()) / minutes,
                    r.goldEarned() / minutes,
                    ratio((double) r.kills() + r.assists(), teamKills),
                    r.assists() / minutes,
                    r.visionScore() / minutes,
                    r.objectiveDamage() / minutes,
                    r.turretDamage() / minutes,
                    r.deaths() / minutes * ScoringRulesV1.parameter(rules, "deathMinutes")
                };

                for (double value : metrics) {
                    if (!Double.isFinite(value) || value < 0) {
                        throw new IllegalArgumentException("Invalid metric");
                    }
                }

                rows.add(new Row(game.match().matchKey(), p, metrics));
            }
        }

        return rows;
    }

    private static double ratio(double x, double denominator) {
        return denominator == 0 ? 0 : x / denominator;
    }
}
