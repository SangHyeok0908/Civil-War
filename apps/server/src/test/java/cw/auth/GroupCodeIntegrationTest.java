package cw.auth;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.AccountContracts.IdentityObservation;
import cw.contracts.ApiException;
import cw.support.DatabaseTestSupport;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class GroupCodeIntegrationTest extends DatabaseTestSupport {
    @Autowired GroupCodeService groups;
    @Autowired AuthService auth;
    @Autowired Clock clock;

    private IdentityObservation current(int i) {
        return new IdentityObservation(
                String.format("fixture-player-%02d", i),
                "Player" + i + "#test",
                "current_summoner",
                Instant.now());
    }

    @Test
    void leadingZeroIsPreserved() {
        SecureRandom fixed =
                new SecureRandom() {
                    @Override
                    public int nextInt(int bound) {
                        return 7;
                    }
                };
        assertThat(new AdminCodeGenerator(fixed).generate()).isEqualTo("000007");
    }

    @Test
    void multipleDevicesUseSameGroupCodeAndKeepLongTokens() {
        GroupCodeService.IssuedGroupCode code = groups.issue();
        AuthService.EnrollmentReply a = auth.enroll(code.code(), current(1));
        AuthService.EnrollmentReply b = auth.enroll(code.code(), current(2));
        assertThat(a.token()).hasSize(43).isNotEqualTo(b.token());
        assertThat(auth.requireCollector(a.token()).memberId()).isEqualTo("member-1");
        assertThat(auth.requireCollector(b.token()).memberId()).isEqualTo("member-2");
        assertThat(groups.status().active()).isTrue();
    }

    @Test
    void rotateAndDeleteRevokeAllDevices() {
        GroupCodeService.IssuedGroupCode old = groups.issue();
        AuthService.EnrollmentReply a = auth.enroll(old.code(), current(1));
        AuthService.EnrollmentReply b = auth.enroll(old.code(), current(2));
        GroupCodeService.IssuedGroupCode next = groups.rotate();
        assertThatThrownBy(() -> auth.requireCollector(a.token())).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> auth.requireCollector(b.token())).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> auth.enroll(old.code(), current(1)))
                .isInstanceOf(ApiException.class);
        AuthService.EnrollmentReply fresh = auth.enroll(next.code(), current(1));
        groups.delete();
        assertThatThrownBy(() -> auth.requireCollector(fresh.token()))
                .isInstanceOf(ApiException.class);
        assertThat(groups.status().active()).isFalse();
    }

    @Test
    void rotationBeforeWriteRejectsOldGeneration() {
        GroupCodeService.IssuedGroupCode code = groups.issue();
        AuthService.EnrollmentReply credential = auth.enroll(code.code(), current(1));
        cw.contracts.MatchContracts.CollectorPrincipal authenticatedBeforeRotation =
                auth.requireCollector(credential.token());
        groups.rotate();
        assertThatThrownBy(() -> ingest.ingestMatch(input(), authenticatedBeforeRotation))
                .isInstanceOf(ApiException.class);
        assertThat(matches.count()).isZero();
    }

    @Test
    void guessLimitSurvivesRestartAndCollectorSuccessCannotResetAdmin() {
        AuthRateLimiter first = new AuthRateLimiter(jdbc, clock);
        for (int i = 0; i < 5; i++) {
            first.failed("admin", "198.51.100.1");
        }
        AuthRateLimiter restarted = new AuthRateLimiter(jdbc, clock);
        restarted.succeeded("collector", "198.51.100.1");
        assertThatThrownBy(() -> restarted.check("admin", "198.51.100.1"))
                .isInstanceOf(ApiException.class)
                .hasMessage("RATE_LIMITED");
        restarted.check("collector", "198.51.100.1");
    }
}
