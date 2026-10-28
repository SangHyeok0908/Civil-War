package cw.riot;

import cw.contracts.AccountContracts.AccountLookup;
import cw.contracts.AccountContracts.SoloRankLookup;

public interface RiotGateway {
    AccountLookup resolveAccount(String riotId);

    SoloRankLookup getSoloRank(String officialPuuid);
}
