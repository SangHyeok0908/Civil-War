package cw.cli;

import cw.auth.AuthService;
import cw.auth.AuthService.CodeReply;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class AdminCodeCommand implements ApplicationRunner {
    private final AuthService auth;

    public AdminCodeCommand(AuthService auth) {
        this.auth = auth;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (args.getNonOptionArgs().contains("admin:code")) {
            CodeReply code = auth.recoverAdmin(args.containsOption("revoke-all"));
            // Deliberate one-time console output; never sent through the application logger.
            System.out.println("ADMIN_CODE=" + code.code());
            System.out.println("ADMIN_CODE_EXPIRES=" + code.expiresAt());
        }
    }
}
