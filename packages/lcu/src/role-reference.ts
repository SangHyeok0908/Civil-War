import { ROLES, type RoleReferenceSample } from "../../contracts/src/index";
export function roleReference(
  raw: any,
  officialPuuid: string,
  lcuPuuid: string,
): RoleReferenceSample | null {
  const i = raw?.info;
  if (
    i?.queueId !== 420 ||
    !Array.isArray(i.participants) ||
    !Number.isSafeInteger(i.gameDuration) ||
    i.gameDuration < 300 ||
    typeof lcuPuuid !== "string" ||
    !lcuPuuid.trim() ||
    lcuPuuid.length > 255
  )
    return null;
  const players = i.participants.filter((p: any) => p.puuid === officialPuuid);
  if (
    players.length !== 1 ||
    players[0].gameEndedInEarlySurrender !== false ||
    !ROLES.includes(players[0].teamPosition) ||
    typeof raw?.metadata?.matchId !== "string" ||
    !Number.isSafeInteger(i.gameStartTimestamp) ||
    i.gameStartTimestamp < 1 ||
    i.gameStartTimestamp > 253402300799999
  )
    return null;
  return {
    source: "solo420",
    puuid: lcuPuuid,
    gameId: raw.metadata.matchId,
    evidence: {
      officialPuuid,
      queueId: 420,
      teamPosition: players[0].teamPosition,
      durationSeconds: i.gameDuration,
      earlyEnded: false,
    },
    playedAt: new Date(i.gameStartTimestamp).toISOString(),
    role: players[0].teamPosition,
  };
}
