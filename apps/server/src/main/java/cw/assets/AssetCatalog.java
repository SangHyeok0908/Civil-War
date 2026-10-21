package cw.assets;

import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@RestController
public class AssetCatalog {
  private final JsonNode catalog;

  public AssetCatalog(JsonMapper json) throws java.io.IOException {
    try (var input = getClass().getResourceAsStream("/assets/catalog.json")) {
      catalog = json.readTree(input);
    }
  }

  @GetMapping("/api/assets")
  public JsonNode get() {
    return catalog;
  }
}
