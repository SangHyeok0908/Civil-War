package cw.lcu;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.ApiException;
import cw.contracts.MatchContracts.IngestMatchInput;
import cw.contracts.MatchContracts.Issue;
import cw.contracts.MatchContracts.NormalizedMatch;
import cw.matches.MatchInputValidator;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

class MatchNormalizerTest {
    final JsonMapper json = JsonMapper.builder().build();
    final MatchNormalizer normalizer = new MatchNormalizer();

    ObjectNode raw() throws Exception {
        return (ObjectNode)
                json.readTree(
                        Files.readString(Path.of(System.getProperty("cw.fixtureRoot"), "G1.json")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"G1.json", "G2.json", "G3.json"})
    void completeTenPlayers(String file) throws Exception {
        NormalizedMatch match =
                normalizer.normalizeMatch(
                        json.readTree(
                                Files.readString(
                                        Path.of(System.getProperty("cw.fixtureRoot"), file))));
        assertThat(match.participants()).hasSize(10);
        assertThat(match.startedAtUtc().toString()).startsWith("2000-01-");
        assertThat(match.participants().stream().filter(p -> p.teamId() == 100)).hasSize(5);
    }

    @Test
    void rejectNineOrDuplicatePlayers() throws Exception {
        ObjectNode a = raw();
        ((ArrayNode) a.get("participants")).remove(9);
        assertThatThrownBy(() -> normalizer.normalizeMatch(a))
                .isInstanceOf(MatchValidationError.class);

        ObjectNode b = raw();
        ((ObjectNode) b.at("/participantIdentities/1/player")).put("puuid", "fixture-player-01");
        assertThatThrownBy(() -> normalizer.normalizeMatch(b))
                .isInstanceOf(MatchValidationError.class);
    }

    @Test
    void missingIsNotZero() throws Exception {
        ObjectNode a = raw();
        ((ObjectNode) a.at("/participants/0/stats")).put("visionScore", 0);
        assertThat(normalizer.normalizeMatch(a).participants().getFirst().visionScore()).isZero();
        ((ObjectNode) a.at("/participants/0/stats")).remove("visionScore");
        assertThatThrownBy(() -> normalizer.normalizeMatch(a))
                .isInstanceOfSatisfying(
                        MatchValidationError.class,
                        e ->
                                assertThat(e.details)
                                        .contains(
                                                new Issue(
                                                        "participants.0.visionScore", "REQUIRED")));
    }

    @Test
    void preserveStringGameId() throws Exception {
        ObjectNode a = raw();
        assertThat(normalizer.normalizeMatch(a).gameId()).isEqualTo("9000000000000000000001");
        a.put("gameId", new BigInteger("9000000000000000000001"));
        assertThat(normalizer.normalizeMatch(a).gameId()).isEqualTo("9000000000000000000001");
    }

    @Test
    void rejectInvalidNumbersTeamsAndDuration() throws Exception {
        for (String field : new String[] {"kills", "deaths", "assists", "item0", "visionScore"}) {
            ObjectNode a = raw();
            ((ObjectNode) a.at("/participants/0/stats")).put(field, -1);
            assertThatThrownBy(() -> normalizer.normalizeMatch(a))
                    .isInstanceOf(MatchValidationError.class);
        }

        ObjectNode a = raw();
        a.put("gameDuration", 0);
        assertThatThrownBy(() -> normalizer.normalizeMatch(a))
                .isInstanceOf(MatchValidationError.class);

        ObjectNode b = raw();
        ((ObjectNode) b.at("/participants/0")).put("teamId", 200);
        assertThatThrownBy(() -> normalizer.normalizeMatch(b))
                .isInstanceOf(MatchValidationError.class);

        ObjectNode c = raw();
        ((ObjectNode) c.at("/participants/0/stats")).put("win", true);
        assertThatThrownBy(() -> normalizer.normalizeMatch(c))
                .isInstanceOf(MatchValidationError.class);
    }

    @Test
    void schemaValidationAndParticipantJoinAreStrict() throws Exception {
        MatchInputValidator validator = new MatchInputValidator(normalizer);
        assertThat(validator.validateIngest(new IngestMatchInput(raw(), "s", 2)).issues())
                .contains(new Issue("schemaVersion", "UNSUPPORTED_SCHEMA"));

        ObjectNode a = raw();
        a.put("queueId", 420);
        assertThatThrownBy(() -> normalizer.normalizeMatch(a))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        e -> assertThat(e.code).isEqualTo("UNSUPPORTED_SCHEMA"));

        ObjectNode b = raw();
        ((ObjectNode) b.at("/participants/1")).put("participantId", 1);
        assertThatThrownBy(() -> normalizer.normalizeMatch(b))
                .isInstanceOf(MatchValidationError.class);

        ObjectNode c = raw();
        ((ObjectNode) c.at("/participants/0/stats")).putNull("visionScore");
        assertThatThrownBy(() -> normalizer.normalizeMatch(c))
                .isInstanceOfSatisfying(
                        MatchValidationError.class,
                        e ->
                                assertThat(e.details)
                                        .contains(
                                                new Issue(
                                                        "participants.0.visionScore",
                                                        "INVALID_TYPE")));

        ObjectNode d = raw();
        ((ObjectNode) d.at("/participants/0/stats")).put("kills", 9_007_199_254_740_992L);
        assertThatThrownBy(() -> normalizer.normalizeMatch(d))
                .isInstanceOf(MatchValidationError.class);
    }

    @Test
    void identityArrayOrderDoesNotChangeJoin() throws Exception {
        ObjectNode a = raw();
        ArrayNode identities = (ArrayNode) a.get("participantIdentities");
        JsonNode first = identities.remove(0);
        identities.add(first);
        assertThat(normalizer.normalizeMatch(a).participants().getFirst().puuid())
                .isEqualTo("fixture-player-01");
    }

    @Test
    void rejectCoercionsAndMissingItems() throws Exception {
        ObjectNode a = raw();
        ((ObjectNode) a.at("/participants/0/stats")).put("visionScore", "0");
        assertThatThrownBy(() -> normalizer.normalizeMatch(a))
                .isInstanceOf(MatchValidationError.class);

        ObjectNode b = raw();
        ((ObjectNode) b.at("/participants/0/stats")).remove("item6");
        assertThatThrownBy(() -> normalizer.normalizeMatch(b))
                .isInstanceOf(MatchValidationError.class);

        ObjectNode c = raw();
        c.put("gameId", 9.0e21);
        assertThatThrownBy(() -> normalizer.normalizeMatch(c))
                .isInstanceOf(MatchValidationError.class);
    }
}
