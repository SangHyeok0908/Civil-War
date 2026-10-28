package cw.auth;

import java.security.SecureRandom;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class AdminCodeGenerator {
    private final SecureRandom random;

    @Autowired
    public AdminCodeGenerator() {
        this(new SecureRandom());
    }

    AdminCodeGenerator(SecureRandom random) {
        this.random = random;
    }

    public String generate() {
        return String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
    }
}
