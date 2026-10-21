package cw.assets;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaController {
  @GetMapping({
    "/",
    "/matches",
    "/matches/{key}",
    "/members",
    "/members/{id}",
    "/rankings",
    "/teams",
    "/admin",
    "/admin/{page}"
  })
  public String index() {
    return "forward:/index.html";
  }
}
