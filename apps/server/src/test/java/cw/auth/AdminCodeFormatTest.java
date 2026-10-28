package cw.auth;

import static org.assertj.core.api.Assertions.*;

import cw.support.DatabaseTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class AdminCodeFormatTest extends DatabaseTestSupport {
    @Autowired AuthService auth;

    @Test
    void adminCodeHasSixDigits() {
        assertThat(auth.issueCode("admin", null, "test").code()).matches("[0-9]{6}");
    }
}
