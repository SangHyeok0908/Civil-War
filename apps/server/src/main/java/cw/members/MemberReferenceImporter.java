package cw.members;

import cw.contracts.ApiException;
import cw.contracts.EvaluationContracts.RoleReferenceSample;
import cw.contracts.MemberContracts.Member;
import cw.contracts.Role;
import cw.db.MutationCoordinator;
import cw.domain.RoleSuggester;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
@Transactional(readOnly = true)
public class MemberReferenceImporter {
    @PersistenceContext private EntityManager em;
    private final MemberService members;
    private final MutationCoordinator mutations;
    private final JsonMapper json;
    private final Clock clock;

    public MemberReferenceImporter(
            MemberService members, MutationCoordinator mutations, JsonMapper json, Clock clock) {
        this.members = members;
        this.mutations = mutations;
        this.json = json;
        this.clock = clock;
    }

    public record ImportInput(
            String memberId,
            String officialPuuid,
            boolean confirmedMapping,
            List<RoleReferenceSample> samples) {}

    @Transactional
    public RoleSuggester.Suggestion importReferences(ImportInput input) {
        mutations.lock();

        if (input == null
                || input.memberId() == null
                || input.officialPuuid() == null
                || input.officialPuuid().isBlank()
                || input.officialPuuid().length() > 255
                || !input.confirmedMapping()
                || input.samples() == null
                || input.samples().size() > 200) {
            throw new ApiException(422, "INVALID_REFERENCE_MAPPING");
        }

        Member member = members.get(input.memberId());
        ReferenceLinkEntity link = em.find(ReferenceLinkEntity.class, member.id());

        if (link != null && !link.officialPuuid.equals(input.officialPuuid())) {
            throw new ApiException(409, "REFERENCE_MAPPING_CONFLICT");
        }

        for (RoleReferenceSample sample : input.samples()) {
            validate(sample, member.puuid(), input.officialPuuid());
        }

        if (link == null) {
            link = new ReferenceLinkEntity();
            link.memberId = member.id();
            link.officialPuuid = input.officialPuuid();
            link.confirmedAt = clock.instant();

            em.persist(link);
        }

        int imported = 0;

        for (RoleReferenceSample sample : input.samples()) {
            if (sample.role() == null) {
                continue;
            }

            long existing =
                    em.createQuery(
                                    "select count(s) from ReferenceSampleEntity s where s.memberId=:m and"
                                            + " s.source='solo420' and s.gameId=:g",
                                    Long.class)
                            .setParameter("m", member.id())
                            .setParameter("g", sample.gameId())
                            .getSingleResult();

            if (existing > 0) {
                continue;
            }

            ReferenceSampleEntity row = new ReferenceSampleEntity();
            row.id = UUID.randomUUID().toString();
            row.memberId = member.id();
            row.source = "solo420";
            row.gameId = sample.gameId();
            row.playedAt = sample.playedAt();
            row.role = sample.role();
            row.evidenceJson = json.writeValueAsString(sample.evidence());

            em.persist(row);
            imported++;
        }

        mutations.audit(
                "references_imported", "owner", member.id(), "{\"count\":" + imported + "}");

        return suggest(member.id());
    }

    private void validate(RoleReferenceSample sample, String lcuPuuid, String officialPuuid) {
        if (sample == null
                || !lcuPuuid.equals(sample.puuid())
                || !"solo420".equals(sample.source())
                || sample.gameId() == null
                || sample.gameId().isBlank()
                || sample.gameId().length() > 100
                || sample.playedAt() == null
                || sample.playedAt().isAfter(clock.instant())
                || sample.playedAt().isBefore(Instant.EPOCH)) {
            invalid();
        }

        JsonNode e = sample.evidence();

        if (e == null
                || !e.isObject()
                || !e.path("officialPuuid").isString()
                || !officialPuuid.equals(e.path("officialPuuid").asString())
                || !e.path("queueId").isIntegralNumber()
                || !e.path("queueId").canConvertToInt()
                || e.path("queueId").asInt() != 420
                || !e.path("durationSeconds").isIntegralNumber()
                || !e.path("durationSeconds").canConvertToLong()
                || e.path("durationSeconds").asLong() < 300
                || !e.path("earlyEnded").isBoolean()
                || e.path("earlyEnded").asBoolean()) {
            invalid();
        }

        if (sample.role() != null
                && !sample.role().name().equals(e.path("teamPosition").asString())) {
            invalid();
        }
    }

    private void invalid() {
        throw new ApiException(422, "INVALID_REFERENCE_SAMPLE");
    }

    public RoleSuggester.Suggestion suggest(String id) {
        members.get(id);

        List<RoleSuggester.Sample> samples = new ArrayList<>();

        for (ReferenceSampleEntity s :
                em.createQuery(
                                "from ReferenceSampleEntity where memberId=:m order by playedAt desc,gameId",
                                ReferenceSampleEntity.class)
                        .setParameter("m", id)
                        .setMaxResults(20)
                        .getResultList()) {
            samples.add(new RoleSuggester.Sample(s.source, s.gameId, s.playedAt, s.role));
        }

        List<Object[]> inhouse =
                em.createQuery(
                                "select m.id,m.startedAt,p.role from MatchEntity m join m.participants p where"
                                        + " m.state='registered' and p.memberId=:m order by m.startedAt desc,m.id",
                                Object[].class)
                        .setParameter("m", id)
                        .setMaxResults(20)
                        .getResultList();

        for (Object[] row : inhouse) {
            samples.add(
                    new RoleSuggester.Sample(
                            "inhouse", (String) row[0], (Instant) row[1], (Role) row[2]));
        }

        return new RoleSuggester().suggest(samples);
    }
}
