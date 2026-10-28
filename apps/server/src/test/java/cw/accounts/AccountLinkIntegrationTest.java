package cw.accounts;

import static org.assertj.core.api.Assertions.*;

import cw.contracts.ApiException;
import cw.members.MemberService;
import cw.support.DatabaseTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class AccountLinkIntegrationTest extends DatabaseTestSupport {
    @Autowired MemberService profiles;
    @Autowired AccountLinkService links;

    private cw.contracts.AccountContracts.IdentityObservation observation(
            String puuid, String riotId, String source) {
        return new cw.contracts.AccountContracts.IdentityObservation(
                puuid, riotId, source, java.time.Instant.now());
    }

    @Test
    void cachedGuestAliasCannotClaimAnotherAccountsHistory() {
        members.deleteById("member-7");
        registered();
        PlayerAccountEntity old = accounts.findById("member-7").orElseThrow();
        old.updatedAt = java.time.Instant.now().minusSeconds(86400);
        accounts.save(old);
        cw.contracts.MemberContracts.Member newcomer =
                profiles.create(json.readTree("{\"riotId\":\"Player7#test\"}"));
        assertThat(newcomer.puuid()).isNull();
        links.observe(observation("new-current-owner", "Player7#test", "current_lookup"));
        assertThat(members.findById(newcomer.id()).orElseThrow().puuid)
                .isEqualTo("new-current-owner");
        assertThat(
                        jdbc.queryForObject(
                                "select member_id from match_participants where player_id='member-7'",
                                String.class))
                .isNull();
    }

    @Test
    void editingCannotDuplicateAnotherMembersRiotId() {
        assertThatThrownBy(
                        () ->
                                profiles.patch(
                                        "member-1", json.readTree("{\"riotId\":\"player2#TEST\"}")))
                .isInstanceOf(ApiException.class);
        assertThat(members.findById("member-1").orElseThrow().riotId).isEqualTo("Player1#test");
    }

    @Test
    void riotIdAloneCreatesProfile() {
        cw.contracts.MemberContracts.Member created =
                profiles.create(json.readTree("{\"riotId\":\"새친구#KR1\"}"));
        assertThat(created.id()).isNotBlank();
        assertThat(created.displayName()).isEqualTo("새친구#KR1");
        assertThat(created.puuid()).isNull();
        assertThat(members.findById(created.id()).orElseThrow().accountId).isNotNull();
    }

    @Test
    void rejectsManualIdentityAndSkillFields() {
        assertThatThrownBy(
                        () ->
                                profiles.create(
                                        json.readTree(
                                                "{\"riotId\":\"새친구#KR1\",\"puuid\":\"manual-key\",\"displayName\":\"Manual\",\"seedSkill\":99}")))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void duplicateRiotIdCannotCreateAnotherMember() {
        profiles.create(json.readTree("{\"riotId\":\"Unique#KR1\"}"));
        assertThatThrownBy(() -> profiles.create(json.readTree("{\"riotId\":\"unique#kr1\"}")))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void rejectsStaleNameOnlyLink() {
        cw.contracts.MemberContracts.Member member =
                profiles.create(json.readTree("{\"riotId\":\"New#KR1\"}"));
        assertThatThrownBy(
                        () -> links.observe(observation("new-lcu", "New#KR1", "historical_match")))
                .isInstanceOf(ApiException.class);
        assertThat(members.findById(member.id()).orElseThrow().puuid).isNull();
    }

    @Test
    void differentOfficialAndLcuKeysCanLinkWithEvidence() {
        cw.contracts.MemberContracts.Member member =
                profiles.create(json.readTree("{\"riotId\":\"Fresh#KR1\"}"));
        PlayerAccountEntity account =
                accounts.findById(members.findById(member.id()).orElseThrow().accountId)
                        .orElseThrow();
        account.officialPuuid = "official-encrypted";
        accounts.save(account);
        links.observe(observation("lcu-raw", "Fresh#KR1", "current_lookup"));
        PlayerAccountEntity linked = accounts.findByLcuPuuid("lcu-raw").orElseThrow();
        assertThat(linked.officialPuuid).isEqualTo("official-encrypted");
        assertThat(linked.id).isEqualTo(account.id);
        assertThat(members.findById(member.id()).orElseThrow().puuid).isEqualTo("lcu-raw");
    }

    @Test
    void duplicateEvidenceIsIdempotent() {
        cw.contracts.MemberContracts.Member member =
                profiles.create(json.readTree("{\"riotId\":\"Fresh#KR1\"}"));
        links.observe(observation("lcu-raw", "Fresh#KR1", "current_lookup"));
        long first = revision();
        links.observe(observation("lcu-raw", "Fresh#KR1", "current_lookup"));
        assertThat(revision()).isEqualTo(first);
        assertThat(members.findById(member.id()).orElseThrow().puuid).isEqualTo("lcu-raw");
    }

    @Test
    void renameKeepsHistory() {
        registered();
        links.observe(observation(actor(1).puuid(), "Changed#KR1", "current_lookup"));
        assertThat(members.findById("member-1").orElseThrow().riotId).isEqualTo("Changed#KR1");
        assertThat(matches.count()).isEqualTo(1);
        assertThat(collector.getCollectorMatch(KEY, actor(1)).confirmedRoles())
                .isEqualTo(roles(false));
    }

    @Test
    void conflictingCurrentNameCannotMoveAnotherMembersHistory() {
        assertThatThrownBy(
                        () ->
                                links.observe(
                                        observation(
                                                actor(1).puuid(),
                                                "Player2#test",
                                                "current_lookup")))
                .isInstanceOf(ApiException.class);
        assertThat(members.findById("member-1").orElseThrow().puuid).isEqualTo(actor(1).puuid());
        assertThat(members.findById("member-2").orElseThrow().puuid).isEqualTo(actor(2).puuid());
    }
}
