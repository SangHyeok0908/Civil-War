package cw.cli;
import cw.auth.AuthService;
import org.springframework.boot.*;
import org.springframework.stereotype.Component;
@Component
public class AdminCodeCommand implements ApplicationRunner {
    private final AuthService auth;
    public AdminCodeCommand(AuthService auth) { this.auth=auth; }
    @Override public void run(ApplicationArguments args) {
        if(args.getNonOptionArgs().contains("admin:code")) {
            var code=auth.recoverAdmin(args.containsOption("revoke-all"));
            // Deliberate one-time console output; never sent through the application logger.
            System.out.println("ADMIN_CODE="+code.code());
            System.out.println("ADMIN_CODE_EXPIRES="+code.expiresAt());
        }
    }
}
