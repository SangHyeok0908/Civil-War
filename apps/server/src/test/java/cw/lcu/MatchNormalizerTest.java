package cw.lcu;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.node.ArrayNode;
import java.nio.file.*;
import static org.assertj.core.api.Assertions.*;

class MatchNormalizerTest {
    final JsonMapper json = JsonMapper.builder().build();
    final MatchNormalizer normalizer = new MatchNormalizer();
    ObjectNode raw() throws Exception { return (ObjectNode) json.readTree(Files.readString(Path.of(System.getProperty("cw.fixtureRoot"), "G1.json"))); }
    @ParameterizedTest @ValueSource(strings={"G1.json","G2.json","G3.json"})
    void completeTenPlayers(String file) throws Exception {
        var match=normalizer.normalizeMatch(json.readTree(Files.readString(Path.of(System.getProperty("cw.fixtureRoot"),file))));
        assertThat(match.participants()).hasSize(10);
        assertThat(match.startedAtUtc().toString()).startsWith("2000-01-");
        assertThat(match.participants().stream().filter(p->p.teamId()==100)).hasSize(5);
    }
    @Test void rejectNineOrDuplicatePlayers() throws Exception {
        var a=raw(); ((ArrayNode)a.get("participants")).remove(9);
        assertThatThrownBy(()->normalizer.normalizeMatch(a)).isInstanceOf(MatchValidationError.class);
        var b=raw(); ((ObjectNode)b.at("/participantIdentities/1/player")).put("puuid","fixture-player-01");
        assertThatThrownBy(()->normalizer.normalizeMatch(b)).isInstanceOf(MatchValidationError.class);
    }
    @Test void missingIsNotZero() throws Exception {
        var a=raw(); ((ObjectNode)a.at("/participants/0/stats")).put("visionScore",0);
        assertThat(normalizer.normalizeMatch(a).participants().getFirst().visionScore()).isZero();
        ((ObjectNode)a.at("/participants/0/stats")).remove("visionScore");
        assertThatThrownBy(()->normalizer.normalizeMatch(a)).isInstanceOfSatisfying(MatchValidationError.class,
            e->assertThat(e.details).contains(new cw.contracts.MatchContracts.Issue("participants.0.visionScore","REQUIRED")));
    }
    @Test void preserveStringGameId() throws Exception {
        var a=raw(); assertThat(normalizer.normalizeMatch(a).gameId()).isEqualTo("9000000000000000000001");
        a.put("gameId",new java.math.BigInteger("9000000000000000000001"));
        assertThat(normalizer.normalizeMatch(a).gameId()).isEqualTo("9000000000000000000001");
    }
    @Test void rejectInvalidNumbersTeamsAndDuration() throws Exception {
        for(String field: new String[]{"kills","deaths","assists","item0","visionScore"}) {
            var a=raw(); ((ObjectNode)a.at("/participants/0/stats")).put(field,-1);
            assertThatThrownBy(()->normalizer.normalizeMatch(a)).isInstanceOf(MatchValidationError.class);
        }
        var a=raw(); a.put("gameDuration",0); assertThatThrownBy(()->normalizer.normalizeMatch(a)).isInstanceOf(MatchValidationError.class);
        var b=raw(); ((ObjectNode)b.at("/participants/0")).put("teamId",200); assertThatThrownBy(()->normalizer.normalizeMatch(b)).isInstanceOf(MatchValidationError.class);
        var c=raw(); ((ObjectNode)c.at("/participants/0/stats")).put("win",true); assertThatThrownBy(()->normalizer.normalizeMatch(c)).isInstanceOf(MatchValidationError.class);
    }
    @Test void rejectCoercionsAndMissingItems() throws Exception {
        var a=raw(); ((ObjectNode)a.at("/participants/0/stats")).put("visionScore","0"); assertThatThrownBy(()->normalizer.normalizeMatch(a)).isInstanceOf(MatchValidationError.class);
        var b=raw(); ((ObjectNode)b.at("/participants/0/stats")).remove("item6"); assertThatThrownBy(()->normalizer.normalizeMatch(b)).isInstanceOf(MatchValidationError.class);
        var c=raw(); c.put("gameId",9.0e21); assertThatThrownBy(()->normalizer.normalizeMatch(c)).isInstanceOf(MatchValidationError.class);
    }
}
