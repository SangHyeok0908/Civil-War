package cw.domain;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.Role;
import cw.domain.RoleSuggester.Suggestion;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class RoleSuggesterTest {
    @Test
    void recentTwentyKnownRolesAndTieByRecencyThenFixedOrder() {
        List<RoleSuggester.Sample> samples = new ArrayList<>();

        for (int i = 0; i < 21; i++) {
            samples.add(
                    new RoleSuggester.Sample(
                            "solo420",
                            "s" + i,
                            Instant.ofEpochSecond(i),
                            i < 11 ? Role.TOP : Role.JUNGLE));
        }

        samples.add(
                new RoleSuggester.Sample("inhouse", "unknown", Instant.ofEpochSecond(100), null));

        Suggestion result = new RoleSuggester().suggest(samples);
        assertThat(result.sampleCount()).isEqualTo(20);
        assertThat(result.primary()).isEqualTo(Role.JUNGLE);
        assertThat(result.secondary()).isEqualTo(Role.TOP);

        result =
                new RoleSuggester()
                        .suggest(
                                List.of(
                                        new RoleSuggester.Sample(
                                                "inhouse", "a", Instant.EPOCH, Role.TOP),
                                        new RoleSuggester.Sample(
                                                "solo420", "b", Instant.EPOCH, Role.JUNGLE)));

        assertThat(result.primary()).isEqualTo(Role.TOP);
        assertThat(result.secondary()).isEqualTo(Role.JUNGLE);
    }

    @Test
    void emptyOrSingleRoleHasNullableSuggestion() {
        assertThat(new RoleSuggester().suggest(List.of()).primary()).isNull();

        Suggestion result =
                new RoleSuggester()
                        .suggest(
                                List.of(
                                        new RoleSuggester.Sample(
                                                "solo420", "a", Instant.EPOCH, Role.TOP)));
        assertThat(result.primary()).isEqualTo(Role.TOP);
        assertThat(result.secondary()).isNull();
    }
}
