package cw.matches;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.ApiException;
import cw.evaluation.EvaluationRepository;
import cw.evaluation.RecalculationWorker;
import cw.members.MemberService;
import cw.support.DatabaseTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class GuestMatchIntegrationTest extends DatabaseTestSupport {
    @Autowired MemberService profiles;
    @Autowired RecalculationWorker worker;
    @Autowired EvaluationRepository evaluation;

    private void retain(int count) {
        for (int i = count + 1; i <= 11; i++) members.deleteById("member-" + i);
    }

    @Test
    void sixKnownFourGuestsCreatesPending() {
        retain(6);
        assertThat(ingest.ingestMatch(input(), actor(1)).state()).isEqualTo("pending");
        assertThat(jdbc.queryForObject("select count(*) from match_participants", Integer.class))
                .isEqualTo(10);
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from match_participants where member_id is null",
                                Integer.class))
                .isEqualTo(4);
        assertThat(revision()).isZero();
        registration.registerMatch(confirmation(false), actor(1));
        worker.runOnce();
        assertThat(evaluation.current().gameScores()).hasSize(10);
        assertThat(evaluation.current().memberStats()).hasSize(6);
    }

    @Test
    void fiveKnownRejected() {
        retain(5);
        assertThatThrownBy(() -> ingest.ingestMatch(input(), actor(1)))
                .isInstanceOf(ApiException.class)
                .hasMessage("INSUFFICIENT_REGISTERED_PARTICIPANTS");
        assertThat(matches.count()).isZero();
    }

    @Test
    void inactiveMemberStillCountsAsRegistered() {
        retain(6);
        profiles.patch("member-6", json.readTree("{\"active\":false}"));
        assertThat(ingest.ingestMatch(input(), actor(1)).state()).isEqualTo("pending");
    }
}
