package cw.auth;
import cw.contracts.ApiException;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Component;
/** Bounded local limiter; trusted proxy forwarding is deliberately disabled. */
@Component
public class AuthRateLimiter {
    private record Attempts(int count,Instant start) {}
    private final Map<String,Attempts> attempts=new HashMap<>();
    private final Clock clock;
    public AuthRateLimiter(Clock clock) { this.clock=clock; }
    public synchronized void check(String ip) {
        attempts.entrySet().removeIf(e->!e.getValue().start().plusSeconds(600).isAfter(clock.instant()));
        var a=attempts.get(ip); if(a!=null && a.count()>=5) throw new ApiException(429,"RATE_LIMITED");
    }
    public synchronized void failed(String ip) {
        if(attempts.size()>=10000 && !attempts.containsKey(ip)) throw new ApiException(429,"RATE_LIMITED");
        var old=attempts.get(ip); attempts.put(ip,new Attempts(old==null?1:old.count()+1,old==null?clock.instant():old.start()));
    }
    public synchronized void succeeded(String ip) { attempts.remove(ip); }
}
