package cw.lcu;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.MatchContracts.RoleSuggestion;
import cw.contracts.Role;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class MatchRoleHintsTest {
    @Test
    void sameMatchEvidenceAndDuplicateRules() {
        JsonNode raw =
                JsonMapper.builder()
                        .build()
                        .readTree(
                                "{\"participantIdentities\":[{\"participantId\":1,\"player\":{\"puuid\":\"guest\"}},{\"participantId\":2,\"player\":{\"puuid\":\"other\"}}],\"participants\":[{\"participantId\":1,\"teamId\":100,\"timeline\":{\"lane\":\"BOTTOM\",\"role\":\"DUO_CARRY\"}},{\"participantId\":2,\"teamId\":100,\"timeline\":{\"lane\":\"BOTTOM\",\"role\":\"DUO_SUPPORT\"}}]}");
        List<RoleSuggestion> suggestions = new MatchRoleHints().suggest(raw);
        assertThat(suggestions)
                .extracting(s -> s.role())
                .containsExactly(Role.BOTTOM, Role.UTILITY);
    }
}
