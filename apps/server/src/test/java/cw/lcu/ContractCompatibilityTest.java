package cw.lcu;

import static org.assertj.core.api.Assertions.*;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class ContractCompatibilityTest {
    @ParameterizedTest
    @ValueSource(strings = {"G1", "G2", "G3"})
    void matchesIndependentLanguageNeutralExpectation(String game) throws Exception {
        Path root = Path.of(System.getProperty("cw.fixtureRoot"));
        JsonMapper json = JsonMapper.builder().build();
        JsonNode expected =
                json.readTree(
                        Files.readString(
                                root.resolve("../../../contracts/v1/" + game + ".normalized.json")
                                        .normalize()));
        JsonNode actual =
                json.readTree(
                        json.writeValueAsString(
                                new MatchNormalizer()
                                        .normalizeMatch(
                                                json.readTree(
                                                        Files.readString(
                                                                root.resolve(game + ".json"))))));
        assertThat(actual).isEqualTo(expected);
    }
}
