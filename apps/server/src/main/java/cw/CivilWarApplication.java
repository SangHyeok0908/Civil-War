package cw;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class CivilWarApplication {
    public static void main(String[] args) {
        if (java.util.Arrays.asList(args).contains("admin:code")) {
            var app = new SpringApplication(CivilWarApplication.class);
            app.setWebApplicationType(org.springframework.boot.WebApplicationType.NONE);
            try (var context = app.run(args)) {
                /* command runner performs local recovery */
            }
        } else {
            SpringApplication.run(CivilWarApplication.class, args);
        }
    }
}
