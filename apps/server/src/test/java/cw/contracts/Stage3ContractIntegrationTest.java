package cw.contracts;

import static org.assertj.core.api.Assertions.*;

import cw.evaluation.*;
import cw.matches.PublicMatchQuery;
import cw.support.DatabaseTestSupport;
import java.nio.file.*;
import java.util.*;
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
        var schema =
                json.readTree(
                                Files.readString(
                                        Path.of(
                                                System.getProperty("cw.contractRoot"),
                                                "stage3.schema.json")))
                        .get("$defs");
        var match = json.valueToTree(publicMatches.get(KEY));
        assertFields(match, schema.get("PublicMatch"));
        for (var p : match.get("participants")) assertFields(p, schema.get("PublicParticipant"));
        for (var score : match.get("scores")) assertFields(score, schema.get("GameScore"));
        var ranks = json.valueToTree(evaluations.rankings());
        assertFields(ranks, schema.get("Rankings"));
        for (var row : ranks.get("members")) {
            assertFields(row, schema.get("RankingRow"));
            assertFields(row.get("stats"), schema.get("MemberStats"));
        }
        var profile = json.valueToTree(evaluations.stats("member-1"));
        assertFields(profile, schema.get("Profile"));
        for (var value : List.of(match, ranks, profile)) {
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
