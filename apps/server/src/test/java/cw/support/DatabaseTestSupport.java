package cw.support;

import cw.contracts.MatchContracts.CollectorPrincipal;
import cw.contracts.MatchContracts.ConfirmationInput;
import cw.contracts.MatchContracts.IngestMatchInput;
import cw.contracts.Role;
import cw.matches.CollectorMatchQuery;
import cw.matches.IngestService;
import cw.matches.MatchRepository;
import cw.matches.RegistrationService;
import cw.members.MemberEntity;
import cw.members.MemberRepository;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

@SpringBootTest
@ActiveProfiles("test")
public abstract class DatabaseTestSupport {
    @Autowired protected JdbcTemplate jdbc;
    @Autowired protected JsonMapper json;
    @Autowired protected MemberRepository members;
    @Autowired protected MatchRepository matches;
    @Autowired protected IngestService ingest;
    @Autowired protected RegistrationService registration;
    @Autowired protected CollectorMatchQuery collector;
    protected static final String KEY = "KR:9000000000000000000001";

    @BeforeEach
    void resetDatabase() {
        // Test profile has a dedicated DB. Fail loudly if pointed at anything else.
        if (!jdbc.queryForObject("select current_database()", String.class).equals("cw_test")) {
            throw new IllegalStateException("Integration tests require cw_test database");
        }

        jdbc.execute(
                "TRUNCATE evaluation_generations, scoring_versions, audit_log, recalculation_jobs, match_participants, matches, collector_credentials, admin_sessions, enrollment_codes, members CASCADE");
        jdbc.update(
                "update service_state set source_revision=0, desired_scoring_version=null, active_generation_id=null");

        for (int i = 1; i <= 11; i++) {
            MemberEntity m = new MemberEntity();
            m.id = "member-" + i;
            m.puuid = String.format("fixture-player-%02d", i);
            m.displayName = "Player " + i;
            m.riotId = "Player" + i + "#test";
            m.active = true;
            m.allowedRoles = "TOP,JUNGLE,MIDDLE,BOTTOM,UTILITY";
            m.seedSkill = 50;

            members.save(m);
        }
    }

    protected ObjectNode raw() {
        try {
            return (ObjectNode)
                    json.readTree(
                            Files.readString(
                                    Path.of(System.getProperty("cw.fixtureRoot"), "G1.json")));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    protected IngestMatchInput input() {
        return new IngestMatchInput(raw(), "submission-1", 1);
    }

    protected CollectorPrincipal actor(int i) {
        return new CollectorPrincipal(
                "member-" + i, "credential-" + i, String.format("fixture-player-%02d", i));
    }

    protected Map<String, Role> roles(boolean reverse) {
        Map<String, Role> result = new LinkedHashMap<>();

        for (int i = 1; i <= 10; i++) {
            result.put(
                    String.format("fixture-player-%02d", i),
                    Role.values()[reverse ? 4 - (i - 1) % 5 : (i - 1) % 5]);
        }

        return result;
    }

    protected ConfirmationInput confirmation(boolean reverse) {
        return new ConfirmationInput(KEY, roles(reverse), "confirm-1");
    }

    protected long revision() {
        return jdbc.queryForObject(
                "select source_revision from service_state where id=1", Long.class);
    }

    protected long jobs() {
        return jdbc.queryForObject("select count(*) from recalculation_jobs", Long.class);
    }

    protected void registered() {
        ingest.ingestMatch(input(), actor(1));
        registration.registerMatch(confirmation(false), actor(1));
    }

    protected <T> List<T> concurrent(Callable<T> a, Callable<T> b) throws Exception {
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            CyclicBarrier barrier = new CyclicBarrier(2);
            Future<T> first =
                    executor.submit(
                            () -> {
                                barrier.await();
                                return a.call();
                            });
            Future<T> second =
                    executor.submit(
                            () -> {
                                barrier.await();
                                return b.call();
                            });

            return List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS));
        }
    }
}
