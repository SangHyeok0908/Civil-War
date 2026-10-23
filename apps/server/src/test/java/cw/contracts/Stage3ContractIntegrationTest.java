package cw.contracts;

import static org.assertj.core.api.Assertions.*;

import cw.evaluation.EvaluationRepository;
import cw.evaluation.RecalculationWorker;
import cw.matches.PublicMatchQuery;
import cw.support.DatabaseTestSupport;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;

class Stage3ContractIntegrationTest extends DatabaseTestSupport {
    @Autowired RecalculationWorker worker;
    @Autowired EvaluationRepository evaluations;
    @Autowired PublicMatchQuery publicMatches;

    @Test
    void publicDtoSchemaAndPrivateDataBoundary() throws Exception {
        registered();
        worker.runOnce();

        JsonNode schema =
                json.readTree(
                                Files.readString(
                                        Path.of(
                                                System.getProperty("cw.contractRoot"),
                                                "stage3.schema.json")))
                        .get("$defs");
        JsonNode match = json.valueToTree(publicMatches.get(KEY));
        assertFields(match, schema.get("PublicMatch"));

        for (JsonNode p : match.get("participants")) {
            assertFields(p, schema.get("PublicParticipant"));
        }

        for (JsonNode score : match.get("scores")) {
            assertFields(score, schema.get("GameScore"));
        }

        JsonNode ranks = json.valueToTree(evaluations.rankings());
        assertFields(ranks, schema.get("Rankings"));

        for (JsonNode row : ranks.get("members")) {
            assertFields(row, schema.get("RankingRow"));
            assertFields(row.get("stats"), schema.get("MemberStats"));
        }

        JsonNode profile = json.valueToTree(evaluations.stats("member-1"));
        assertFields(profile, schema.get("Profile"));

        for (JsonNode value : List.of(match, ranks, profile)) {
            assertThat(value.toString())
                    .doesNotContain(
                            "puuid",
                            "seedSkill",
                            "rawMatch",
                            "rawJson",
                            "credential",
                            "secretHash");
        }
    }

    private void assertFields(JsonNode value, JsonNode definition) {
        Set<String> required = new HashSet<>();
        definition.get("required").forEach(n -> required.add(n.asString()));
        assertThat(new HashSet<>(value.propertyNames())).isEqualTo(required);
    }
}
