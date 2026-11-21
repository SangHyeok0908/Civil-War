package cw.domain;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

class RankSeedPolicyTest {
    @Test
    void tierOrderIsMonotone() {
        assertThat(RankSeedPolicy.toSeed("IRON", "IV")).isEqualTo(0.);
        assertThat(RankSeedPolicy.toSeed("GOLD", "I")).isEqualTo(50.);
        assertThat(RankSeedPolicy.toSeed("DIAMOND", "I")).isEqualTo(90.);
        assertThat(RankSeedPolicy.toSeed("MASTER", "I")).isEqualTo(93.);
        assertThat(RankSeedPolicy.toSeed("CHALLENGER", "I")).isEqualTo(100.);
        assertThatThrownBy(() -> RankSeedPolicy.toSeed("UNKNOWN", "I"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
