package cw.lcu;
import java.util.List;
import cw.contracts.ApiException;
import cw.contracts.MatchContracts.Issue;
public class MatchValidationError extends ApiException {
    public MatchValidationError(List<Issue> issues) { super(422, "INVALID_MATCH", issues); }
}
