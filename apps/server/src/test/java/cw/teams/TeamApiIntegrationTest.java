package cw.teams;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import cw.evaluation.RecalculationWorker;
import cw.support.DatabaseTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

@AutoConfigureMockMvc
class TeamApiIntegrationTest extends DatabaseTestSupport {
  @Autowired MockMvc mvc;
  @Autowired RecalculationWorker worker;

  String body() {
    return json.writeValueAsString(
        java.util.Map.of(
            "memberIds",
            java.util.stream.IntStream.rangeClosed(1, 10).mapToObj(i -> "member-" + i).toList()));
  }

  @Test
  void anonymousAllowed() throws Exception {
    mvc.perform(post("/api/teams/recommend").contentType("application/json").content(body()))
        .andExpect(status().isAccepted())
        .andExpect(jsonPath("$.code").value("RECALCULATING"));
    worker.runOnce();
    mvc.perform(post("/api/teams/recommend").contentType("application/json").content(body()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.candidates.length()").value(3));
  }

  @Test
  void publicRateLimiting() throws Exception {
    for (int i = 0; i < 60; i++)
      mvc.perform(
              post("/api/teams/recommend")
                  .with(
                      r -> {
                        r.setRemoteAddr("192.0.2.7");
                        return r;
                      })
                  .contentType("application/json")
                  .content(body()))
          .andExpect(status().isAccepted());
    mvc.perform(
            post("/api/teams/recommend")
                .with(
                    r -> {
                      r.setRemoteAddr("192.0.2.7");
                      return r;
                    })
                .contentType("application/json")
                .content(body()))
        .andExpect(status().isTooManyRequests())
        .andExpect(header().string("Retry-After", "600"));
  }
}
