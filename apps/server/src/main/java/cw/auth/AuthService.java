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
    private final AdminLoginCode adminCode;
    private final SecureRandom random = new SecureRandom();

    public AuthService(
            MutationCoordinator mutations,
            MemberRepository members,
            Clock clock,
            GroupCodeService groups,
            AccountLinkService links,
            AdminLoginCode adminCode) {
        this.mutations = mutations;
        this.members = members;
        this.clock = clock;
        this.groups = groups;
        this.links = links;
        this.adminCode = adminCode;
    }

    public record EnrollmentReply(
            String token,
            String memberId,
            String credentialId,
            String puuid,
            long codeGeneration) {}

    public record LoginReply(String token, String sessionId, String csrfToken) {}

    public record AdminPrincipal(String sessionId, String csrfHash) {}

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

        if (!adminCode.matches(code)) {
            throw new ApiException(401, "AUTH_REVOKED");
        }
        String token = secret();
        String csrf = csrfFor(token);

        AdminSession session = new AdminSession();
        session.id = UUID.randomUUID().toString();
        session.secretHash = hash(token);
        session.csrfHash = hash(csrf);
        session.createdAt = clock.instant();
        session.lastSeenAt = session.createdAt;

        em.persist(session);
        mutations.audit("admin_login", "owner", session.id, "{}");

        return new LoginReply(token, session.id, csrf);
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
