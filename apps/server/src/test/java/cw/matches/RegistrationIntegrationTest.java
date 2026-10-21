package cw.matches;
import cw.support.DatabaseTestSupport;
import cw.contracts.*;
import cw.contracts.MatchContracts.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class RegistrationIntegrationTest extends DatabaseTestSupport {
    @Test void pendingExcludedUntilConfirmed() {
        assertThat(ingest.ingestMatch(input(),actor(1)).state()).isEqualTo("pending");
        assertThat(revision()).isZero(); assertThat(jobs()).isZero();
        assertThat(matches.findByStateOrderByStartedAtDescIdDesc("registered")).isEmpty();
        registration.registerMatch(confirmation(false),actor(2));
        assertThat(revision()).isEqualTo(1); assertThat(jobs()).isEqualTo(1);
    }
    @Test void concurrentDuplicateIngest() throws Exception {
        var results=concurrent(()->ingest.ingestMatch(input(),actor(1)),()->ingest.ingestMatch(input(),actor(2)));
        assertThat(results).extracting(IngestMatchAck::disposition).containsExactlyInAnyOrder("created_pending","already_pending");
        assertThat(matches.count()).isEqualTo(1); assertThat(revision()).isZero();
        assertThat(jdbc.queryForObject("select count(*) from match_participants",Integer.class)).isEqualTo(10);
        assertThat(jdbc.queryForObject("select count(*) from audit_log",Integer.class)).isEqualTo(1);
    }
    @Test void concurrentConfirmation() throws Exception {
        ingest.ingestMatch(input(),actor(1));
        var results=concurrent(()->registration.registerMatch(confirmation(false),actor(1)),()->registration.registerMatch(confirmation(true),actor(2)));
        assertThat(results).extracting(RegistrationAck::disposition).containsExactlyInAnyOrder("created","already_registered");
        assertThat(revision()).isEqualTo(1); assertThat(jobs()).isEqualTo(1);
        assertThat(collector.getCollectorMatch(KEY,actor(1)).confirmedRoles()).isIn(roles(false),roles(true));
    }
    @Test void retryAfterLostReply() {
        ingest.ingestMatch(input(),actor(1)); // response lost
        assertThat(ingest.ingestMatch(input(),actor(1)).disposition()).isEqualTo("already_pending");
        registration.registerMatch(confirmation(false),actor(1)); // response lost
        assertThat(registration.registerMatch(confirmation(false),actor(1)).disposition()).isEqualTo("already_registered");
        assertThat(matches.count()).isEqualTo(1); assertThat(jobs()).isEqualTo(1);
    }
    @Test void duplicateDoesNotRecalculate() {
        registered(); var altered=raw(); altered.put("gameDuration",5555);
        assertThat(ingest.ingestMatch(new IngestMatchInput(altered,"retry",1),actor(2)).disposition()).isEqualTo("already_registered");
        assertThat(collector.getCollectorMatch(KEY,actor(1)).match().durationSeconds()).isEqualTo(1942);
        assertThat(revision()).isEqualTo(1); assertThat(jobs()).isEqualTo(1);
    }
    @Test void retryCannotChangeRoles() {
        registered(); registration.registerMatch(confirmation(true),actor(2));
        assertThat(collector.getCollectorMatch(KEY,actor(2)).confirmedRoles()).isEqualTo(roles(false));
        assertThat(revision()).isEqualTo(1);
    }
    @Test void canceledCannotReturn() {
        registered(); jdbc.update("update matches set state='canceled' where id=?",KEY);
        assertThat(ingest.ingestMatch(input(),actor(2)).disposition()).isEqualTo("already_canceled");
        assertThatThrownBy(()->registration.registerMatch(confirmation(false),actor(1)))
            .isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code).isEqualTo("MATCH_CANCELED"));
        assertThat(collector.getCollectorMatch(KEY,actor(1)).state()).isEqualTo("canceled");
    }
    @Test void allTenMustBeMembers() {
        members.deleteById("member-10");
        assertThatThrownBy(()->ingest.ingestMatch(input(),actor(1))).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code).isEqualTo("UNREGISTERED_PARTICIPANT"));
        assertThat(matches.count()).isZero(); assertThat(jobs()).isZero();
    }
    @Test void participantOnlyReadAndConfirm() {
        ingest.ingestMatch(input(),actor(1));
        assertThatThrownBy(()->collector.getCollectorMatch(KEY,actor(11))).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->registration.registerMatch(confirmation(false),actor(11))).isInstanceOf(ApiException.class);
        assertThat(registration.registerMatch(confirmation(false),actor(2)).disposition()).isEqualTo("created");
    }
    @Test void rollbackLeavesNoPartialParticipantsOrJob() {
        jdbc.execute("alter table audit_log add constraint injected_failure check(action <> 'match_ingested')");
        try { assertThatThrownBy(()->ingest.ingestMatch(input(),actor(1))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class); }
        finally { jdbc.execute("alter table audit_log drop constraint injected_failure"); }
        assertThat(matches.count()).isZero();
        assertThat(jdbc.queryForObject("select count(*) from match_participants",Integer.class)).isZero();
        assertThat(jobs()).isZero(); assertThat(revision()).isZero();
    }
}
