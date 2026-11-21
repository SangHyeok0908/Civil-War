package cw.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Operator login code read from the server-only setting {@code ADMIN_LOGIN_CODE}.
 *
 * <p>The value never lives in source control. The server refuses to start without a usable value so
 * a missing or short setting cannot silently fall back to a guessable code. Only the hash is kept
 * in memory, and error messages never include the value.
 */
@Component
public class AdminLoginCode {
    static final int MIN_LENGTH = 8;
    static final int MAX_LENGTH = 128;

    private final String hash;

    public AdminLoginCode(@Value("${cw.admin.login-code:}") String code) {
        if (code == null || code.isBlank()) {
            throw new IllegalStateException(
                    "ADMIN_LOGIN_CODE가 비어 있습니다. 서버 .env 파일에 운영자 로그인 코드를 넣으세요.");
        }
        if (!code.equals(code.strip())) {
            throw new IllegalStateException("ADMIN_LOGIN_CODE의 앞뒤에 공백을 넣을 수 없습니다.");
        }
        if (code.length() < MIN_LENGTH || code.length() > MAX_LENGTH) {
            throw new IllegalStateException(
                    "ADMIN_LOGIN_CODE는 " + MIN_LENGTH + "자 이상 " + MAX_LENGTH + "자 이하여야 합니다.");
        }
        if (code.startsWith("replace-with-")) {
            throw new IllegalStateException("ADMIN_LOGIN_CODE에 예시 값이 남아 있습니다. 새 값으로 바꾸세요.");
        }
        this.hash = AuthService.hash(code);
    }

    boolean matches(String input) {
        return AuthService.matchesHash(input, hash);
    }
}
