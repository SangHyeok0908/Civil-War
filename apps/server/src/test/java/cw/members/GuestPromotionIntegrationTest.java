package cw.members;

import static org.assertj.core.api.Assertions.*;

import cw.accounts.AccountLinkService;
import cw.contracts.AccountContracts.IdentityObservation;
import cw.contracts.MatchContracts.ConfirmationInput;
import cw.contracts.MatchContracts.IngestMatchInput;
import cw.evaluation.EvaluationRepository;
import cw.evaluation.RecalculationWorker;
import cw.matches.AdminMatchService;
import cw.support.DatabaseTestSupport;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class GuestPromotionIntegrationTest extends DatabaseTestSupport {
    @Autowired MemberService profiles;
    @Autowired AccountLinkService links;
    @Autowired RecalculationWorker worker;
    @Autowired EvaluationRepository evaluations;
    @Autowired AdminMatchService admin;

    private void guests() {
        for (int i = 7; i <= 11; i++) {
            members.deleteById("member-" + i);
        }
    }

    @Test
    void promotionRacingConfirmationCountsOnce() throws Exception {
        guests();
        ingest.ingestMatch(input(), actor(1));
        concurrent(
                () -> profiles.create(json.readTree("{\"riotId\":\"Player7#test\"}")),
                () -> registration.registerMatch(confirmation(false), actor(1)));
        MemberEntity promoted = members.findByRiotIdIgnoreCase("Player7#test").getFirst();
        assertThat(promoted.accountId).isEqualTo("member-7");
        assertThat(matches.count()).isEqualTo(1);
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from match_participants where member_id=?",
                                Integer.class,
                                promoted.id))
                .isEqualTo(1);
        worker.runOnce();
        assertThat(evaluations.current().memberStats())
                .filteredOn(s -> s.memberId().equals(promoted.id))
                .singleElement()
                .satisfies(s -> assertThat(s.games()).isEqualTo(1));
        long before = revision();
        links.observe(
                new IdentityObservation(
                        promoted.puuid, promoted.riotId, "current_lookup", Instant.now()));
        assertThat(revision()).isEqualTo(before);
    }

    @Test
    void canceledHistoryNeverReturns() {
        guests();
        registered();
        tools.jackson.databind.node.ObjectNode second = raw();
        second.put("gameId", "9000000000000000000002");
        String canceled =
                ingest.ingestMatch(new IngestMatchInput(second, "second", 1), actor(1)).matchKey();
        registration.registerMatch(
                new ConfirmationInput(canceled, roles(false), "confirm-second"), actor(1));
        admin.cancel(canceled);
        cw.contracts.MemberContracts.Member member =
                profiles.create(json.readTree("{\"riotId\":\"Player7#test\"}"));
        worker.runOnce();
        assertThat(evaluations.current().memberStats())
                .filteredOn(s -> s.memberId().equals(member.id()))
                .singleElement()
                .satisfies(s -> assertThat(s.games()).isEqualTo(1));
        assertThat(matches.findById(canceled).orElseThrow().state).isEqualTo("canceled");
        assertThat(matches.count()).isEqualTo(2);
    }
}
