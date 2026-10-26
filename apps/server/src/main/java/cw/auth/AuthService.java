package cw.auth;

import cw.contracts.ApiException;
import cw.contracts.MatchContracts.CollectorPrincipal;
import cw.db.MutationCoordinator;
import cw.members.MemberEntity;
import cw.members.MemberRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class AuthService {
    @PersistenceContext private EntityManager em;
    private final MutationCoordinator mutations;
    private final MemberRepository members;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public AuthService(MutationCoordinator mutations, MemberRepository members, Clock clock) {
        this.mutations = mutations;
        this.members = members;
        this.clock = clock;
    }

    public record CodeReply(String id, String code, String scope, Instant expiresAt) {}

    public record EnrollmentReply(
            String token, String memberId, String credentialId, String puuid) {}

    public record LoginReply(String token, String sessionId, String csrfToken) {}

    public record AdminPrincipal(String sessionId, String csrfHash) {}

    public CodeReply issueCode(String scope, String memberId, String actor) {
        mutations.lock();

        if (scope == null || !Set.of("admin", "collector").contains(scope)) {
            throw new ApiException(422, "INVALID_SCOPE");
        }

        if (scope.equals("collector") && (memberId == null || !members.existsById(memberId))) {
            throw new ApiException(422, "UNREGISTERED_PARTICIPANT");
        }

        if (scope.equals("admin") && memberId != null) {
            throw new ApiException(422, "INVALID_SCOPE");
        }

        String code = secret();

        EnrollmentCode entity = new EnrollmentCode();
        entity.id = UUID.randomUUID().toString();
        entity.secretHash = hash(code);
        entity.scope = scope;
        entity.memberId = memberId;
        entity.expiresAt =
                clock.instant()
                        .plus(
                                scope.equals("admin")
                                        ? Duration.ofMinutes(30)
                                        : Duration.ofHours(24));

        em.persist(entity);
        mutations.audit("code_issued", actor, entity.id, "{\"scope\":\"" + scope + "\"}");

        return new CodeReply(entity.id, code, scope, entity.expiresAt);
    }

    public CodeReply recoverAdmin(boolean revokeAll) {
        mutations.lock();

        if (revokeAll) {
            em.createQuery("update AdminSession s set s.revoked=true").executeUpdate();
            em.createQuery("update EnrollmentCode c set c.revoked=true where c.scope='admin'")
                    .executeUpdate();
            mutations.audit("admin_recovered", "local", "owner", "{}");
        }

        return issueCode("admin", null, "local");
    }

    public EnrollmentReply enroll(String code, String currentPuuid) {
        mutations.lock();

        EnrollmentCode entity = usableCode(code, "collector");
        MemberEntity member =
                members.findById(entity.memberId)
                        .orElseThrow(() -> new ApiException(401, "AUTH_REVOKED"));

        if (!member.puuid.equals(currentPuuid)) {
            throw new ApiException(403, "ACCOUNT_MISMATCH");
        }

        String token = secret();

        CollectorCredential credential = new CollectorCredential();
        credential.id = UUID.randomUUID().toString();
        credential.secretHash = hash(token);
        credential.memberId = member.id;
        credential.createdAt = clock.instant();

        em.persist(credential);
        entity.consumed = true;
        mutations.audit("collector_enrolled", member.id, credential.id, "{}");

        return new EnrollmentReply(token, member.id, credential.id, member.puuid);
    }

    public LoginReply login(String code) {
        mutations.lock();

        EnrollmentCode entity = usableCode(code, "admin");
        String token = secret();
        String csrf = csrfFor(token);

        AdminSession session = new AdminSession();
        session.id = UUID.randomUUID().toString();
        session.secretHash = hash(token);
        session.csrfHash = hash(csrf);
        session.createdAt = clock.instant();
        session.lastSeenAt = session.createdAt;

        em.persist(session);
        entity.consumed = true;
        mutations.audit("admin_login", "owner", session.id, "{}");

        return new LoginReply(token, session.id, csrf);
    }

    private EnrollmentCode usableCode(String value, String scope) {
        List<EnrollmentCode> list =
                em.createQuery(
                                "select c from EnrollmentCode c where c.secretHash=:hash",
                                EnrollmentCode.class)
                        .setParameter("hash", hash(value))
                        .getResultList();

        if (list.isEmpty()) {
            throw new ApiException(401, "AUTH_REVOKED");
        }

        EnrollmentCode code = list.getFirst();

        if (!code.scope.equals(scope)
                || code.consumed
                || code.revoked
                || !code.expiresAt.isAfter(clock.instant())) {
            throw new ApiException(401, "AUTH_REVOKED");
        }

        return code;
    }

    public AdminPrincipal requireAdmin(String token) {
        mutations.lock();

        List<AdminSession> found =
                em.createQuery(
                                "select s from AdminSession s where s.secretHash=:hash",
                                AdminSession.class)
                        .setParameter("hash", hash(token))
                        .getResultList();

        if (found.isEmpty()) {
            throw new ApiException(401, "AUTH_REVOKED");
        }

        AdminSession s = found.getFirst();
        Instant now = clock.instant();

        if (s.revoked
                || !s.lastSeenAt.plus(Duration.ofDays(7)).isAfter(now)
                || !s.createdAt.plus(Duration.ofDays(30)).isAfter(now)) {
            throw new ApiException(401, "AUTH_REVOKED");
        }

        s.lastSeenAt = now;

        return new AdminPrincipal(s.id, s.csrfHash);
    }

    @Transactional(readOnly = true)
    public CollectorPrincipal requireCollector(String token) {
        List<CollectorCredential> found =
                em.createQuery(
                                "select c from CollectorCredential c where c.secretHash=:hash",
                                CollectorCredential.class)
                        .setParameter("hash", hash(token))
                        .getResultList();

        if (found.isEmpty() || found.getFirst().revoked) {
            throw new ApiException(401, "AUTH_REVOKED");
        }

        CollectorCredential c = found.getFirst();
        MemberEntity member =
                members.findById(c.memberId)
                        .orElseThrow(() -> new ApiException(401, "AUTH_REVOKED"));

        return new CollectorPrincipal(member.id, c.id, member.puuid);
    }

    public void revoke(String kind, String id) {
        mutations.lock();

        switch (kind) {
            case "sessions" -> {
                AdminSession s = em.find(AdminSession.class, id);

                if (s == null) {
                    throw new ApiException(404, "NOT_FOUND");
                }

                s.revoked = true;
            }
            case "collector-credentials" -> {
                CollectorCredential c = em.find(CollectorCredential.class, id);

                if (c == null) {
                    throw new ApiException(404, "NOT_FOUND");
                }

                c.revoked = true;
            }
            case "codes" -> {
                EnrollmentCode c = em.find(EnrollmentCode.class, id);

                if (c == null) {
                    throw new ApiException(404, "NOT_FOUND");
                }

                c.revoked = true;
            }
            default -> throw new ApiException(404, "NOT_FOUND");
        }

        mutations.audit("auth_revoked", "owner", id, "{\"kind\":\"" + kind + "\"}");
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> credentials() {
        return em
                .createQuery(
                        "select c from CollectorCredential c order by c.createdAt",
                        CollectorCredential.class)
                .getResultList()
                .stream()
                .map(
                        c ->
                                Map.<String, Object>of(
                                        "id",
                                        c.id,
                                        "memberId",
                                        c.memberId,
                                        "revoked",
                                        c.revoked,
                                        "createdAt",
                                        c.createdAt))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> sessions() {
        return em
                .createQuery(
                        "select s from AdminSession s order by s.createdAt", AdminSession.class)
                .getResultList()
                .stream()
                .map(
                        s ->
                                Map.<String, Object>of(
                                        "id",
                                        s.id,
                                        "revoked",
                                        s.revoked,
                                        "createdAt",
                                        s.createdAt,
                                        "lastSeenAt",
                                        s.lastSeenAt))
                .toList();
    }

    public static String csrfFor(String token) {
        return hash("csrf:" + token);
    }

    public static String hash(String value) {
        if (value == null || value.length() > 512) {
            throw new ApiException(401, "AUTH_REVOKED");
        }

        try {
            return HexFormat.of()
                    .formatHex(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    public static boolean matchesHash(String value, String expected) {
        return value != null
                && value.length() <= 512
                && MessageDigest.isEqual(
                        hash(value).getBytes(StandardCharsets.US_ASCII),
                        expected.getBytes(StandardCharsets.US_ASCII));
    }

    private String secret() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);

        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
