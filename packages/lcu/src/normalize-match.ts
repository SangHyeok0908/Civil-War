import {
  ClientError,
  object,
  text,
  type NormalizedMatch,
  type Participant,
} from "../../contracts/src/index";
function n(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < min ||
    Number(value) > max
  )
    throw new ClientError(value === undefined ? "REQUIRED" : "INVALID_TYPE");
  return value as number;
}
function a(value: unknown, count: number): any[] {
  if (!Array.isArray(value) || value.length !== count)
    throw new ClientError("INVALID_MATCH");
  return value;
}
export function normalizeMatch(input: unknown): NormalizedMatch {
  const r = object(input);
  const platformId = text(r.platformId);
  if (!/^[A-Z0-9]{1,16}$/.test(platformId))
    throw new ClientError("INVALID_MATCH");
  const gameId =
    typeof r.gameId === "number" && Number.isSafeInteger(r.gameId)
      ? String(r.gameId)
      : text(r.gameId);
  if (!/^\d{1,30}$/.test(gameId)) throw new ClientError("INVALID_MATCH");
  if (
    r.gameType !== "CUSTOM_GAME" ||
    r.gameMode !== "CLASSIC" ||
    r.mapId !== 11 ||
    r.queueId !== 3130 ||
    r.endOfGameResult !== "GameComplete"
  )
    throw new ClientError("UNSUPPORTED_SCHEMA");
  const identities = new Map<number, string>();
  const unique = new Set<string>();
  for (const v of a(r.participantIdentities, 10)) {
    const id = n(v.participantId, 1);
    const puuid = text(object(v.player).puuid);
    if (identities.has(id) || unique.has(puuid))
      throw new ClientError("INVALID_MATCH");
    identities.set(id, puuid);
    unique.add(puuid);
  }
  const wins = new Map<number, boolean>();
  for (const t of a(r.teams, 2)) {
    if (
      ![100, 200].includes(t.teamId) ||
      !["Win", "Fail"].includes(t.win) ||
      wins.has(t.teamId)
    )
      throw new ClientError("INVALID_MATCH");
    wins.set(t.teamId, t.win === "Win");
  }
  if (new Set(wins.values()).size !== 2) throw new ClientError("INVALID_MATCH");
  const ids = new Set<number>();
  const participants: Participant[] = a(r.participants, 10).map((p) => {
    const id = n(p.participantId, 1);
    const puuid = identities.get(id);
    if (!puuid || ids.has(id) || !wins.has(p.teamId))
      throw new ClientError("INVALID_MATCH");
    ids.add(id);
    const s = object(p.stats);
    if (typeof s.win !== "boolean" || s.win !== wins.get(p.teamId))
      throw new ClientError("INVALID_MATCH");
    return {
      puuid,
      teamId: p.teamId,
      win: s.win,
      championId: n(p.championId, 1, 2147483647),
      kills: n(s.kills),
      deaths: n(s.deaths),
      assists: n(s.assists),
      championDamage: n(s.totalDamageDealtToChampions),
      damageTaken: n(s.totalDamageTaken),
      laneCs: n(s.totalMinionsKilled),
      neutralCs: n(s.neutralMinionsKilled),
      goldEarned: n(s.goldEarned),
      visionScore: n(s.visionScore),
      objectiveDamage: n(s.damageDealtToObjectives),
      turretDamage: n(s.damageDealtToTurrets),
      items: Array.from({ length: 7 }, (_, i) => n(s["item" + i])),
    };
  });
  if (participants.filter((p) => p.teamId === 100).length !== 5)
    throw new ClientError("INVALID_MATCH");
  return {
    schemaVersion: 1,
    platformId,
    gameId,
    startedAtUtc: new Date(n(r.gameCreation, 1, 253402300799999))
      .toISOString()
      .replace(".000Z", "Z"),
    durationSeconds: n(r.gameDuration, 1),
    mapId: 11,
    gameType: "CUSTOM_GAME",
    patch: text(r.gameVersion),
    participants,
  };
}
