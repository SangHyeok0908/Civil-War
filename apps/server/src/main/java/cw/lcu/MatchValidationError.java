package cw.lcu;

import cw.contracts.ApiException;
import cw.contracts.MatchContracts.Issue;
import java.util.List;

public class MatchValidationError extends ApiException {
    public MatchValidationError(List<Issue> issues) {
        super(422, "INVALID_MATCH", issues);
    }
}
