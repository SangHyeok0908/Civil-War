package cw.db;
import org.springframework.context.annotation.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.core.StreamReadFeature;
@Configuration
public class DatabaseConfiguration {
    @Bean public JsonMapper jsonMapper() {
        return JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();
    }
    @Bean public java.time.Clock clock() { return java.time.Clock.systemUTC(); }
}
