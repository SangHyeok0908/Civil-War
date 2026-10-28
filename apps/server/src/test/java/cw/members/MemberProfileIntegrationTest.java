package cw.members;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import cw.contracts.AccountContracts.AccountLookup;
import cw.contracts.AccountContracts.ProfileIconLookup;
import cw.riot.MemberProfileService;
import cw.riot.RiotGateway;
import cw.support.DatabaseTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

class MemberProfileIntegrationTest extends DatabaseTestSupport {
    @MockitoBean RiotGateway gateway;
    @Autowired MemberProfileService pictures;
    @Autowired MemberService profiles;

    private void available(int icon) {
        when(gateway.resolveAccount("Player1#test"))
                .thenReturn(new AccountLookup("verified", "official-profile", "Player1#test"));
        when(gateway.getProfileIcon("official-profile"))
                .thenReturn(new ProfileIconLookup("available", icon, 0));
    }

    @Test
    void publicAndAdminUseCachedIconWithoutPrivateIdentityOrExternalReads() {
        available(685);
        long before = revision();
        pictures.refresh("member-1");
        clearInvocations(gateway);
        assertThat(profiles.get("member-1").profileIconId()).isEqualTo(685);
        String publicJson = json.writeValueAsString(profiles.publicList());
        assertThat(publicJson).contains("\"profileIconId\":685");
        assertThat(publicJson).doesNotContain("official-profile", "puuid", "riotId", "token");
        verifyNoInteractions(gateway);
        assertThat(revision()).isEqualTo(before);
    }

    @Test
    void failureKeepsLastPhotoAndHonorsRetryDelay() {
        available(0);
        pictures.refresh("member-1");
        when(gateway.getProfileIcon("official-profile"))
                .thenReturn(new ProfileIconLookup("unavailable", null, 600000));
        pictures.refresh("member-1");
        assertThat(pictures.icon("member-1", "Player1#test")).isZero();
        java.sql.Timestamp next =
                jdbc.queryForObject(
                        "select next_attempt_at from member_profile_snapshots where member_id='member-1'",
                        java.sql.Timestamp.class);
        assertThat(next.toInstant()).isAfter(java.time.Instant.now().plusSeconds(599));
    }

    @Test
    void lateResponseForChangedRiotIdIsDiscarded() {
        available(685);
        when(gateway.getProfileIcon("official-profile"))
                .thenAnswer(
                        invocation -> {
                            jdbc.update(
                                    "update members set riot_id='Changed#test' where id='member-1'");
                            return new ProfileIconLookup("available", 685, 0);
                        });
        pictures.refresh("member-1");
        assertThat(pictures.icon("member-1", "Changed#test")).isNull();
        assertThat(
                        jdbc.queryForObject(
                                "select count(*) from member_profile_snapshots", Integer.class))
                .isZero();
    }

    @Test
    void cachedPhotoForPreviousRiotIdIsNeverShown() {
        available(685);
        pictures.refresh("member-1");
        jdbc.update("update members set riot_id='Changed#test' where id='member-1'");
        assertThat(profiles.get("member-1").profileIconId()).isNull();
    }

    @Test
    void missingOrMalformedLookupDoesNotPreventReadingMembers() {
        when(gateway.resolveAccount("Player1#test")).thenReturn(null);
        pictures.refresh("member-1");
        assertThat(profiles.publicList()).hasSize(11);
        assertThat(pictures.icon("member-1", "Player1#test")).isNull();
        available(-1);
        pictures.refresh("member-1");
        assertThat(pictures.icon("member-1", "Player1#test")).isNull();
    }
}
