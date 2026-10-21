package cw.contracts;
import java.util.List;
import cw.contracts.MatchContracts.Issue;
public class ApiException extends RuntimeException {
    public final int status;
    public final String code;
    public final boolean retryable;
    public final List<Issue> details;
    public ApiException(int status, String code) { this(status, code, List.of()); }
    public ApiException(int status, String code, List<Issue> details) {
        super(code); this.status=status; this.code=code; this.details=details; this.retryable=status>=500 || status==429;
    }
}
