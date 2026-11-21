package cw.auth;

import static org.assertj.core.api.Assertions.*;

import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

class AdminLoginCodeTest {
    @Test
    void missingShortLongOrPaddedSettingStopsStartupWithoutEchoingTheValue() {
        String tooLong = "a".repeat(AdminLoginCode.MAX_LENGTH + 1);
        List<String> rejected =
                Arrays.asList(
                        null,
                        "",
                        "   ",
                        "2005",
                        "seven77",
                        " padded-code",
                        "padded-code ",
                        "replace-with-a-new-long-admin-code",
                        tooLong);
        for (String value : rejected) {
            Throwable failure = catchThrowable(() -> new AdminLoginCode(value));
            assertThat(failure).isInstanceOf(IllegalStateException.class);
            if (value != null && !value.isBlank()) {
                assertThat(failure.getMessage()).doesNotContain(value.strip());
            }
        }
    }

    @Test
    void acceptsBoundaryLengthsAndComparesExactly() {
        String shortest = "a".repeat(AdminLoginCode.MIN_LENGTH);
        String longest = "b".repeat(AdminLoginCode.MAX_LENGTH);
        assertThat(new AdminLoginCode(shortest).matches(shortest)).isTrue();
        assertThat(new AdminLoginCode(longest).matches(longest)).isTrue();

        AdminLoginCode code = new AdminLoginCode("owner-pass-2026");
        assertThat(code.matches("owner-pass-2026")).isTrue();
        for (String other :
                Arrays.asList(null, "", "owner-pass-202", "Owner-pass-2026", "owner-pass-2026 ")) {
            assertThat(code.matches(other)).isFalse();
        }
    }
}
