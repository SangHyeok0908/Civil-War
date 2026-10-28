package cw.auth;

import cw.contracts.ApiException;
import cw.contracts.MatchContracts.CollectorPrincipal;
import cw.db.MutationCoordinator;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class GroupCodeService {
    @PersistenceContext private EntityManager em;
    private final MutationCoordinator mutations;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public GroupCodeService(MutationCoordinator mutations, Clock clock) {
        this.mutations = mutations;
        this.clock = clock;
    }

    public record Status(boolean active, long generation, Instant issuedAt) {}

    public record IssuedGroupCode(String code, long generation) {}

    private GroupCollectorCode current() {
        return em.find(GroupCollectorCode.class, 1);
    }

    @Transactional(readOnly = true)
    public Status status() {
        var code = current();
        return new Status(code.secretHash != null, code.generation, code.issuedAt);
    }

    public IssuedGroupCode issue() {
        mutations.lock();
        if (current().secretHash != null) throw new ApiException(409, "GROUP_CODE_EXISTS");
        return replace();
    }

    public IssuedGroupCode rotate() {
        mutations.lock();
        if (current().secretHash == null) throw new ApiException(409, "GROUP_CODE_MISSING");
        return replace();
    }

    private IssuedGroupCode replace() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String secret = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        var code = current();
        code.secretHash = AuthService.hash(secret);
        code.generation++;
        code.issuedAt = clock.instant();
        em.createQuery("update CollectorCredential c set c.revoked=true").executeUpdate();
        mutations.audit("group_code_replaced", "owner", Long.toString(code.generation), "{}");
        return new IssuedGroupCode(secret, code.generation);
    }

    public void delete() {
        mutations.lock();
        var code = current();
        if (code.secretHash == null) return;
        code.secretHash = null;
        code.generation++;
        em.createQuery("update CollectorCredential c set c.revoked=true").executeUpdate();
        mutations.audit("group_code_deleted", "owner", Long.toString(code.generation), "{}");
    }

    @Transactional(readOnly = true)
    public long verifyCode(String secret) {
        var code = current();
        if (code.secretHash == null || !AuthService.matchesHash(secret, code.secretHash))
            throw new ApiException(401, "AUTH_REVOKED");
        return code.generation;
    }

    @Transactional(readOnly = true)
    public void requireCurrentGeneration(CollectorPrincipal principal) {
        var code = current();
        if (code.secretHash == null || principal.codeGeneration() != code.generation)
            throw new ApiException(401, "AUTH_REVOKED");
    }
}
