package cw.matches;

import cw.contracts.ApiException;
import cw.contracts.MatchContracts.CollectorPrincipal;
import cw.contracts.MatchContracts.ConfirmationInput;
import cw.contracts.MatchContracts.RegistrationAck;
import cw.db.MutationCoordinator;
import cw.db.ServiceState;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RegistrationService {
    private final MatchRepository matches;
    private final MatchInputValidator validator;
    private final MutationCoordinator mutations;
    private final MatchViews views;

    public RegistrationService(
            MatchRepository matches,
            MatchInputValidator validator,
            MutationCoordinator mutations,
            MatchViews views) {
        this.matches = matches;
        this.validator = validator;
        this.mutations = mutations;
        this.views = views;
    }

    @Transactional
    public RegistrationAck registerMatch(ConfirmationInput input, CollectorPrincipal actor) {
        MatchInputValidator.submission(input.clientSubmissionId());

        ServiceState state = mutations.lock();
        MatchEntity entity =
                matches.findById(input.matchKey())
                        .orElseThrow(() -> new ApiException(404, "NOT_FOUND"));
        views.requireParticipant(entity, actor);

        if (entity.state.equals("canceled")) {
            throw new ApiException(409, "MATCH_CANCELED");
        }

        if (entity.state.equals("registered")) {
            return new RegistrationAck(entity.id, "already_registered", entity.registeredRevision);
        }

        validator.requireRoles(input, views.normalized(entity));

        for (MatchParticipantEntity p : entity.participants) {
            p.role = input.rolesByPuuid().get(p.puuid);
        }

        entity.state = "registered";
        entity.registeredRevision = mutations.changed(state);

        mutations.audit("match_registered", actor.memberId(), entity.id, "{}");

        return new RegistrationAck(entity.id, "created", entity.registeredRevision);
    }
}
