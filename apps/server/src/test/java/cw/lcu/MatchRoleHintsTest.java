package cw.lcu;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.Role;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class MatchRoleHintsTest {
    @Test
    void sameMatchEvidenceAndDuplicateRules() {
        var raw =
                JsonMapper.builder()
                        .build()
                        .readTree(
                                "{\"participantIdentities\":[{\"participantId\":1,\"player\":{\"puuid\":\"guest\"}},{\"participantId\":2,\"player\":{\"puuid\":\"other\"}}],\"participants\":[{\"participantId\":1,\"teamId\":100,\"timeline\":{\"lane\":\"BOTTOM\",\"role\":\"DUO_CARRY\"}},{\"participantId\":2,\"teamId\":100,\"timeline\":{\"lane\":\"BOTTOM\",\"role\":\"DUO_SUPPORT\"}}]}");
        var suggestions = new MatchRoleHints().suggest(raw);
        assertThat(suggestions)
                .extracting(s -> s.role())
                .containsExactly(Role.BOTTOM, Role.UTILITY);
    }
}
