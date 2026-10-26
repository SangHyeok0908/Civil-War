import { expect, it } from "vitest";
import { roleReference } from "./role-reference";
it("soloReferenceOnly uses official PUUID and excludes early termination", () => {
  const r = {
    metadata: { matchId: "KR_1" },
    info: {
      queueId: 420,
      gameStartTimestamp: 1,
      gameDuration: 1800,
      participants: [
        {
          puuid: "official",
          teamPosition: "JUNGLE",
          gameEndedInEarlySurrender: false,
        },
      ],
    },
  };
  expect(roleReference(r, "official", "lcu-puuid")?.source).toBe("solo420");
  expect(roleReference(r, "lcu-other", "lcu-puuid")).toBeNull();
  expect(
    roleReference(
      { ...r, info: { ...r.info, queueId: 440 } },
      "official",
      "lcu-puuid",
    ),
  ).toBeNull();
  r.info.participants[0].gameEndedInEarlySurrender = true;
  expect(roleReference(r, "official", "lcu-puuid")).toBeNull();
});
it("keeps the LCU member identity distinct from the official API identity", () => {
  const raw = {
    metadata: { matchId: "KR_1" },
    info: {
      queueId: 420,
      gameStartTimestamp: 1,
      gameDuration: 1800,
      participants: [
        {
          puuid: "official-puuid",
          teamPosition: "TOP",
          gameEndedInEarlySurrender: false,
        },
      ],
    },
  };
  const sample = roleReference(raw, "official-puuid", "lcu-puuid");
  expect(sample).toMatchObject({
    puuid: "lcu-puuid",
    gameId: "KR_1",
    evidence: { officialPuuid: "official-puuid" },
  });
});
