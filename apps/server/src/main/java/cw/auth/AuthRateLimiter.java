package cw.auth;

import cw.contracts.ApiException;
import java.sql.Timestamp;
import java.time.Clock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class AuthRateLimiter {
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public AuthRateLimiter(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public void check(String ip) {
        check("admin", ip);
    }

    public void failed(String ip) {
        failed("admin", ip);
    }

    public void succeeded(String ip) {
        succeeded("admin", ip);
    }

    @Transactional
    public void check(String scope, String ip) {
        jdbc.update(
                "delete from auth_attempts where started_at<=?",
                Timestamp.from(clock.instant().minusSeconds(600)));
        if (count(scope + ":" + ip) >= 5 || ("admin".equals(scope) && count("admin:global") >= 50))
            throw new ApiException(429, "RATE_LIMITED");
    }

    private int count(String bucket) {
        return jdbc.query(
                "select attempts from auth_attempts where bucket=?",
                rs -> rs.next() ? rs.getInt(1) : 0,
                bucket);
    }

    private void increment(String bucket) {
        jdbc.update(
                "insert into auth_attempts(bucket,attempts,started_at) values(?,1,?) on conflict(bucket) do update set attempts=case when auth_attempts.started_at<=excluded.started_at-interval '10 minutes' then 1 else auth_attempts.attempts+1 end,started_at=case when auth_attempts.started_at<=excluded.started_at-interval '10 minutes' then excluded.started_at else auth_attempts.started_at end",
                bucket,
                Timestamp.from(clock.instant()));
    }

    @Transactional
    public void failed(String scope, String ip) {
        if (jdbc.queryForObject("select count(*) from auth_attempts", Integer.class) >= 10000
                && count(scope + ":" + ip) == 0) throw new ApiException(429, "RATE_LIMITED");
        increment(scope + ":" + ip);
        if ("admin".equals(scope)) increment("admin:global");
    }

    @Transactional
    public void succeeded(String scope, String ip) {
        jdbc.update("delete from auth_attempts where bucket=?", scope + ":" + ip);
        if ("admin".equals(scope))
            jdbc.update("delete from auth_attempts where bucket='admin:global'");
    }
}
