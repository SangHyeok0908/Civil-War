package cw.accounts;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class PlayerAccountMigrationIntegrationTest {
    @Autowired DataSource dataSource;

    @Test
    void emptyDatabaseAppliesAllAccountMigrations() {
        String schema = "ux_empty_" + UUID.randomUUID().toString().replace("-", "");
        Flyway migration =
                Flyway.configure()
                        .dataSource(dataSource)
                        .locations("classpath:db/migrations")
                        .schemas(schema)
                        .defaultSchema(schema)
                        .cleanDisabled(false)
                        .load();
        try {
            assertThat(migration.migrate().migrationsExecuted).isEqualTo(11);
            JdbcTemplate jdbc = new JdbcTemplate(dataSource);
            assertThat(
                            jdbc.queryForObject(
                                    "select count(*) from " + schema + ".member_profile_snapshots",
                                    Integer.class))
                    .isZero();
            assertThat(
                            jdbc.queryForObject(
                                    "select count(*) from " + schema + ".members", Integer.class))
                    .isZero();
            assertThat(
                            jdbc.queryForObject(
                                    "select generation from "
                                            + schema
                                            + ".group_collector_code where id=1",
                                    Long.class))
                    .isEqualTo(1);
            assertThat(
                            jdbc.queryForObject(
                                    "select count(*) from information_schema.columns where table_schema=? and table_name='match_participants' and column_name='player_id' and is_nullable='NO'",
                                    Integer.class,
                                    schema))
                    .isEqualTo(1);
        } finally {
            migration.clean();
        }
    }

    @Test
    void backfillKeepsMemberAndMatchKeys() throws Exception {
        String schema = "ux_migration_" + UUID.randomUUID().toString().replace("-", "");
        Flyway old =
                Flyway.configure()
                        .dataSource(dataSource)
                        .locations("classpath:db/migrations")
                        .schemas(schema)
                        .defaultSchema(schema)
                        .target("4")
                        .cleanDisabled(false)
                        .load();
        old.migrate();
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        try {
            try (Connection c = dataSource.getConnection()) {
                c.setSchema(schema);
                try (PreparedStatement insert =
                        c.prepareStatement(
                                "insert into members values(?,?,?,?,true,'TOP',null,'TOP',37,1)")) {
                    for (int i = 0; i < 10; i++) {
                        insert.setString(1, "legacy-" + i);
                        insert.setString(2, "legacy-puuid-" + i);
                        insert.setString(3, "Legacy" + i + "#KR1");
                        insert.setString(4, "Legacy " + i);
                        insert.executeUpdate();
                    }
                }
                for (String state : List.of("registered", "pending", "canceled")) {
                    try (PreparedStatement insert =
                            c.prepareStatement(
                                    "insert into matches(id,platform_id,game_id,state,started_at,raw_json,normalized_json,created_at) values(?, 'KR',?,?,now(),?, '{}',now())")) {
                        insert.setString(1, "KR:" + state);
                        insert.setString(2, state);
                        insert.setString(3, state);
                        insert.setString(4, "{\"exactDecimal\":1.00000000000000000001}");
                        insert.executeUpdate();
                    }
                    try (PreparedStatement insert =
                            c.prepareStatement(
                                    "insert into match_participants values(?,?,?,?,100,67,true,'TOP')")) {
                        for (int i = 0; i < 10; i++) {
                            insert.setString(1, state + "-" + i);
                            insert.setString(2, "KR:" + state);
                            insert.setString(3, "legacy-" + i);
                            insert.setString(4, "legacy-puuid-" + i);
                            insert.executeUpdate();
                        }
                    }
                }
                try (Statement insert = c.createStatement()) {
                    insert.execute(
                            "insert into admin_sessions values('legacy-session',repeat('a',64),repeat('b',64),now(),now(),false)");
                    insert.execute(
                            "insert into collector_credentials values('legacy-device',repeat('c',64),'legacy-0',now(),false)");
                    insert.execute(
                            "insert into enrollment_codes values('old-personal',repeat('d',64),'collector','legacy-0',now()+interval '1 day',false,false)");
                }
                c.setSchema("public");
            }
            List<Map<String, Object>> before =
                    jdbc.queryForList(
                            "select id,state,raw_json,normalized_json from "
                                    + schema
                                    + ".matches order by id");
            Flyway.configure()
                    .dataSource(dataSource)
                    .locations("classpath:db/migrations")
                    .schemas(schema)
                    .defaultSchema(schema)
                    .load()
                    .migrate();
            assertThat(
                            jdbc.queryForObject(
                                    "select count(*) from information_schema.tables where table_schema=? and table_name='player_accounts'",
                                    Integer.class,
                                    schema))
                    .isEqualTo(1);
            assertThat(
                            jdbc.queryForObject(
                                    "select count(*) from " + schema + ".player_accounts",
                                    Integer.class))
                    .isEqualTo(10);
            assertThat(
                            jdbc.queryForObject(
                                    "select count(*) from "
                                            + schema
                                            + ".match_participants where player_id is not null",
                                    Integer.class))
                    .isEqualTo(30);
            assertThat(
                            jdbc.queryForList(
                                    "select id,state,raw_json,normalized_json from "
                                            + schema
                                            + ".matches order by id"))
                    .isEqualTo(before);
            assertThat(
                            jdbc.queryForObject(
                                    "select count(*) from "
                                            + schema
                                            + ".members where id=account_id",
                                    Integer.class))
                    .isEqualTo(10);
            assertThat(
                            jdbc.queryForObject(
                                    "select revoked from "
                                            + schema
                                            + ".admin_sessions where id='legacy-session'",
                                    Boolean.class))
                    .isFalse();
            assertThat(
                            jdbc.queryForObject(
                                    "select revoked from "
                                            + schema
                                            + ".collector_credentials where id='legacy-device'",
                                    Boolean.class))
                    .isTrue();
            assertThat(
                            jdbc.queryForObject(
                                    "select revoked from "
                                            + schema
                                            + ".enrollment_codes where id='old-personal'",
                                    Boolean.class))
                    .isTrue();
            assertThat(
                            jdbc.queryForObject(
                                    "select count(*) from information_schema.columns where table_schema=? and table_name in ('members','match_participants') and column_name in ('account_id','player_id') and is_nullable='NO'",
                                    Integer.class,
                                    schema))
                    .isEqualTo(2);
        } finally {
            old.clean();
        }
    }
}
