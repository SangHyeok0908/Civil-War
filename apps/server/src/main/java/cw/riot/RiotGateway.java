package cw.riot;

import cw.contracts.AccountContracts.AccountLookup;
import cw.contracts.AccountContracts.ProfileIconLookup;
import cw.contracts.AccountContracts.SoloRankLookup;

public interface RiotGateway {
    AccountLookup resolveAccount(String riotId);

    SoloRankLookup getSoloRank(String officialPuuid);

    ProfileIconLookup getProfileIcon(String officialPuuid);

    /**
     * Tells whether a stored PUUID still belongs to the current API key: "valid", "foreign_key"
     * (Riot cannot decrypt it, so another key issued it) or "unavailable".
     */
    String puuidState(String officialPuuid);
}
