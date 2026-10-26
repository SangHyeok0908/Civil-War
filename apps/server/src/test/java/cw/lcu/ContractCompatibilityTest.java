package cw.lcu;
import java.nio.file.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
class ContractCompatibilityTest {
    @ParameterizedTest @ValueSource(strings={"G1","G2","G3"})
    void matchesIndependentLanguageNeutralExpectation(String game) throws Exception {
        var root=Path.of(System.getProperty("cw.fixtureRoot")); var json=JsonMapper.builder().build();
        var expected=json.readTree(Files.readString(root.resolve("../../../contracts/v1/"+game+".normalized.json").normalize()));
        var actual=json.readTree(json.writeValueAsString(new MatchNormalizer().normalizeMatch(json.readTree(Files.readString(root.resolve(game+".json"))))));
        assertThat(actual).isEqualTo(expected);
    }
}
