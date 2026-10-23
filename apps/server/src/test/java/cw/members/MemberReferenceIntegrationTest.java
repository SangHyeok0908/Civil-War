package cw.members;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.ApiException;
import cw.contracts.EvaluationContracts.RoleReferenceSample;
import cw.contracts.MemberContracts.Member;
import cw.contracts.Role;
import cw.domain.RoleSuggester.Suggestion;
import cw.members.MemberReferenceImporter.ImportInput;
import cw.support.DatabaseTestSupport;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.node.ObjectNode;

class MemberReferenceIntegrationTest extends DatabaseTestSupport {
    @Autowired MemberReferenceImporter importer;
    @Autowired MemberService memberService;

    MemberReferenceImporter.ImportInput input(boolean confirmed) {
        return new MemberReferenceImporter.ImportInput(
                "member-1",
                "official-1",
                confirmed,
                List.of(
                        new RoleReferenceSample(
                                "fixture-player-01",
                                "solo420",
                                "KR_9",
                                Instant.parse("2026-01-01T00:00:00Z"),
                                Role.JUNGLE,
                                json.readTree(
                                        "{\"officialPuuid\":\"official-1\",\"queueId\":420,\"teamPosition\":\"JUNGLE\",\"durationSeconds\":1800,\"earlyEnded\":false}"))));
    }

    @Test
    void referenceDoesNotOverwriteManualAndSoloNeverEntersRanking() {
        Member before = memberService.get("member-1");
        long rev = revision();
        long count = matches.count();
        Suggestion result = importer.importReferences(input(true));
        assertThat(result.primary()).isEqualTo(Role.JUNGLE);
        assertThat(memberService.get("member-1")).isEqualTo(before);
        assertThat(revision()).isEqualTo(rev);
        assertThat(matches.count()).isEqualTo(count);
        importer.importReferences(input(true));
        assertThat(importer.suggest("member-1").sampleCount()).isEqualTo(1);
    }

    @Test
    void overflowingEvidenceIsRejected() {
        ImportInput base = input(true);
        RoleReferenceSample sample = base.samples().getFirst();
        ObjectNode evidence = (ObjectNode) sample.evidence();
        evidence.put("queueId", 4294967716L);
        assertThatThrownBy(() -> importer.importReferences(base)).isInstanceOf(ApiException.class);
    }

    @Test
    void confirmedMappingRequiredAndCannotSilentlyChangeIdentity() {
        assertThatThrownBy(() -> importer.importReferences(input(false)))
                .isInstanceOf(ApiException.class);
        importer.importReferences(input(true));

        ImportInput i = input(true);
        assertThatThrownBy(
                        () ->
                                importer.importReferences(
                                        new MemberReferenceImporter.ImportInput(
                                                i.memberId(),
                                                "another-official",
                                                true,
                                                i.samples())))
                .isInstanceOf(ApiException.class);
    }
}
