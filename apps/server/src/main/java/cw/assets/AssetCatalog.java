package cw.assets;

import java.io.IOException;
import java.io.InputStream;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@RestController
public class AssetCatalog {
    private final JsonNode catalog;

    public AssetCatalog(JsonMapper json) throws IOException {
        try (InputStream input = getClass().getResourceAsStream("/assets/catalog.json")) {
            catalog = json.readTree(input);
        }
    }

    @GetMapping("/api/assets")
    public JsonNode get() {
        return catalog;
    }
}
