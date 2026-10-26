package cw;

import java.util.Arrays;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ConfigurableApplicationContext;

@SpringBootApplication
public class CivilWarApplication {
    public static void main(String[] args) {
        if (Arrays.asList(args).contains("admin:code")) {
            SpringApplication app = new SpringApplication(CivilWarApplication.class);
            app.setWebApplicationType(WebApplicationType.NONE);

            try (ConfigurableApplicationContext context = app.run(args)) {
                /* command runner performs local recovery */
            }
        } else {
            SpringApplication.run(CivilWarApplication.class, args);
        }
    }
}
