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
    @Test void schemaValidationAndParticipantJoinAreStrict() throws Exception {
        var validator=new cw.matches.MatchInputValidator(normalizer);
        assertThat(validator.validateIngest(new cw.contracts.MatchContracts.IngestMatchInput(raw(),"s",2)).issues())
            .contains(new cw.contracts.MatchContracts.Issue("schemaVersion","UNSUPPORTED_SCHEMA"));
        var a=raw(); a.put("queueId",420);
        assertThatThrownBy(()->normalizer.normalizeMatch(a)).isInstanceOfSatisfying(cw.contracts.ApiException.class,e->assertThat(e.code).isEqualTo("UNSUPPORTED_SCHEMA"));
        var b=raw(); ((ObjectNode)b.at("/participants/1")).put("participantId",1);
        assertThatThrownBy(()->normalizer.normalizeMatch(b)).isInstanceOf(MatchValidationError.class);
        var c=raw(); ((ObjectNode)c.at("/participants/0/stats")).putNull("visionScore");
        assertThatThrownBy(()->normalizer.normalizeMatch(c)).isInstanceOfSatisfying(MatchValidationError.class,e->assertThat(e.details).contains(new cw.contracts.MatchContracts.Issue("participants.0.visionScore","INVALID_TYPE")));
        var d=raw(); ((ObjectNode)d.at("/participants/0/stats")).put("kills",9_007_199_254_740_992L);
        assertThatThrownBy(()->normalizer.normalizeMatch(d)).isInstanceOf(MatchValidationError.class);
    }
    @Test void identityArrayOrderDoesNotChangeJoin() throws Exception {
        var a=raw(); var identities=(ArrayNode)a.get("participantIdentities");
        var first=identities.remove(0); identities.add(first);
        assertThat(normalizer.normalizeMatch(a).participants().getFirst().puuid()).isEqualTo("fixture-player-01");
    }
    @Test void rejectCoercionsAndMissingItems() throws Exception {
        var a=raw(); ((ObjectNode)a.at("/participants/0/stats")).put("visionScore","0"); assertThatThrownBy(()->normalizer.normalizeMatch(a)).isInstanceOf(MatchValidationError.class);
        var b=raw(); ((ObjectNode)b.at("/participants/0/stats")).remove("item6"); assertThatThrownBy(()->normalizer.normalizeMatch(b)).isInstanceOf(MatchValidationError.class);
        var c=raw(); c.put("gameId",9.0e21); assertThatThrownBy(()->normalizer.normalizeMatch(c)).isInstanceOf(MatchValidationError.class);
    }
}
