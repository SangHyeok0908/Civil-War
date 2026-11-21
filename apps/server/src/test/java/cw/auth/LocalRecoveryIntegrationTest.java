package cw.auth;

import static org.assertj.core.api.Assertions.*;

import cw.support.DatabaseTestSupport;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class LocalRecoveryIntegrationTest extends DatabaseTestSupport {
    @Autowired AuthService auth;

    @Test
    void removedIssuanceCommandExitsBeforeTouchingExistingSessionsOrRecords() throws Exception {
        AuthService.LoginReply session = auth.login(ADMIN_CODE);
        Path output = Files.createTempFile("cw-removed-cli-", ".log");
        try {
            Process process =
                    new ProcessBuilder(
                                    Path.of(System.getProperty("java.home"), "bin", "java")
                                            .toString(),
                                    "-jar",
                                    System.getProperty("cw.serverJar"),
                                    "admin:code",
                                    "--revoke-all")
                            .redirectErrorStream(true)
                            .redirectOutput(output.toFile())
                            .start();
            boolean exited = process.waitFor(10, TimeUnit.SECONDS);
            if (!exited) {
                process.destroyForcibly();
            }
            assertThat(exited).isTrue();
            assertThat(process.exitValue()).isNotZero();
            assertThat(Files.readString(output))
                    .doesNotContain("ADMIN_CODE=", session.token(), "Tomcat started");
            assertThat(auth.requireAdmin(session.token()).sessionId())
                    .isEqualTo(session.sessionId());
            assertThat(members.count()).isEqualTo(11);
        } finally {
            Files.deleteIfExists(output);
        }
    }
}
