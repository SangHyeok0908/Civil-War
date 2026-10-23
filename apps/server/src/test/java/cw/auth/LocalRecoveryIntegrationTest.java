package cw.auth;

import static org.assertj.core.api.Assertions.*;

import cw.auth.AuthService.CodeReply;
import cw.auth.AuthService.LoginReply;
import cw.contracts.ApiException;
import cw.support.DatabaseTestSupport;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;

class LocalRecoveryIntegrationTest extends DatabaseTestSupport {
    @Autowired AuthService auth;
    @Autowired Environment env;

    @Test
    void packagedLocalRecoveryRevokesAndPrintsCodeExactlyOnce() throws Exception {
        CodeReply consumed = auth.issueCode("admin", null, "test");
        LoginReply session = auth.login(consumed.code());
        CodeReply oldCode = auth.issueCode("admin", null, "test");
        Path output = Files.createTempFile("cw-cli-test-", ".log");

        try {
            ProcessBuilder command =
                    new ProcessBuilder(
                            Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                            "-jar",
                            System.getProperty("cw.serverJar"),
                            "admin:code",
                            "--revoke-all",
                            "--spring.main.banner-mode=off",
                            "--logging.level.root=ERROR");
            command.environment()
                    .put("DATABASE_URL", env.getRequiredProperty("spring.datasource.url"));
            command.environment()
                    .put("DATABASE_USER", env.getRequiredProperty("spring.datasource.username"));
            command.environment()
                    .put(
                            "DATABASE_PASSWORD",
                            env.getRequiredProperty("spring.datasource.password"));
            command.environment().remove("SPRING_PROFILES_ACTIVE");

            Process process =
                    command.redirectErrorStream(true).redirectOutput(output.toFile()).start();
            boolean exited = process.waitFor(40, TimeUnit.SECONDS);

            if (!exited) {
                process.destroyForcibly();
            }

            assertThat(exited).as("CLI must exit without starting a web listener").isTrue();
            assertThat(process.exitValue()).isZero();

            String captured = Files.readString(output);
            List<String> codes =
                    captured.lines().filter(line -> line.startsWith("ADMIN_CODE=")).toList();
            assertThat(codes).hasSize(1);

            String fresh = codes.getFirst().substring("ADMIN_CODE=".length());
            assertThat(fresh).matches("[A-Za-z0-9_-]{43}");
            assertThat(captured).doesNotContain("Tomcat started", session.token(), oldCode.code());
            assertThat(captured.split(Pattern.quote(fresh), -1)).hasSize(2);
            assertThatThrownBy(() -> auth.requireAdmin(session.token()))
                    .isInstanceOf(ApiException.class);
            assertThatThrownBy(() -> auth.login(oldCode.code())).isInstanceOf(ApiException.class);
            assertThat(auth.login(fresh).sessionId()).isNotBlank();
            assertThat(
                            jdbc.queryForObject(
                                    "select count(*) from audit_log where action='admin_recovered'",
                                    Integer.class))
                    .isEqualTo(1);
            System.out.println(
                    "LOCAL_RECOVERY exit=0 codeLines=1 previousSessionRejected=true previousCodeRejected=true newCodeConsumed=true webListener=false");
        } finally {
            Files.deleteIfExists(output);
        }
    }
}
