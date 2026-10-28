package cw.auth;

import cw.accounts.AccountLinkService;
import cw.contracts.AccountContracts.IdentityObservation;
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
    private final GroupCodeService groups;
    private final AccountLinkService links;
    private final AdminCodeGenerator adminCodes;
    private final SecureRandom random = new SecureRandom();

    public AuthService(
            MutationCoordinator mutations,
            MemberRepository members,
            Clock clock,
            GroupCodeService groups,
            AccountLinkService links,
            AdminCodeGenerator adminCodes) {
        this.mutations = mutations;
        this.members = members;
        this.clock = clock;
        this.groups = groups;
        this.links = links;
        this.adminCodes = adminCodes;
    }

    public record CodeReply(String id, String code, String scope, Instant expiresAt) {}

    public record EnrollmentReply(
            String token,
            String memberId,
            String credentialId,
            String puuid,
            long codeGeneration) {}

    public record LoginReply(String token, String sessionId, String csrfToken) {}

    public record AdminPrincipal(String sessionId, String csrfHash) {}

    public CodeReply issueCode(String scope, String memberId, String actor) {
        mutations.lock();
        if (!"admin".equals(scope) || memberId != null) {
            throw new ApiException(422, "INVALID_SCOPE");
        }
        String code = null;
        for (int attempt = 0; attempt < 30; attempt++) {
            String candidate = adminCodes.generate();
            if (em.createQuery(
                                    "select count(c) from EnrollmentCode c where c.secretHash=:hash",
                                    Long.class)
                            .setParameter("hash", hash(candidate))
                            .getSingleResult()
                    == 0) {
                code = candidate;
                break;
            }
        }
        if (code == null) {
            throw new ApiException(503, "CODE_GENERATION_FAILED");
        }
        em.createQuery(
                        "update EnrollmentCode c set c.revoked=true where c.scope='admin' and c.consumed=false")
                .executeUpdate();
        EnrollmentCode entity = new EnrollmentCode();
        entity.id = UUID.randomUUID().toString();
        entity.secretHash = hash(code);
        entity.scope = "admin";
        entity.expiresAt = clock.instant().plus(Duration.ofMinutes(30));
        em.persist(entity);
        mutations.audit("code_issued", actor, entity.id, "{\"scope\":\"admin\"}");
        return new CodeReply(entity.id, code, "admin", entity.expiresAt);
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

    public EnrollmentReply enroll(String code, IdentityObservation current) {
        mutations.lock();
        groups.verifyCode(code);
        if (current == null || !"current_summoner".equals(current.source())) {
            throw new ApiException(422, "ACCOUNT_EVIDENCE_REQUIRED");
        }
        links.observe(current);
        return enroll(code, current.puuid());
    }

    public EnrollmentReply enroll(String code, String currentPuuid) {
        mutations.lock();
        long generation = groups.verifyCode(code);
        MemberEntity member =
                members.findByPuuid(currentPuuid)
                        .orElseThrow(() -> new ApiException(403, "UNREGISTERED_COLLECTOR"));
        String token = secret();
        CollectorCredential credential = new CollectorCredential();
        credential.id = UUID.randomUUID().toString();
        credential.secretHash = hash(token);
        credential.memberId = member.id;
        credential.codeGeneration = generation;
        credential.createdAt = clock.instant();
        em.persist(credential);
        mutations.audit("collector_enrolled", member.id, credential.id, "{}");
        return new EnrollmentReply(token, member.id, credential.id, member.puuid, generation);
    }

    public LoginReply login(String code) {
        mutations.lock();

        if (code == null || !code.matches("[0-9]{6}")) {
            throw new ApiException(401, "AUTH_REVOKED");
        }
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

        CollectorPrincipal principal =
                new CollectorPrincipal(member.id, c.id, member.puuid, c.codeGeneration);
        groups.requireCurrentGeneration(principal);
        return principal;
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
