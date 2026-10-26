import {
  ClientError,
  object,
  text,
  validateRoles,
  type CollectorMatch,
  type Member,
  type NormalizedMatch,
  type Participant,
} from "./index";
function integer(value: unknown, min = 0) {
  if (!Number.isSafeInteger(value) || Number(value) < min)
    throw new Error("integer");
  return value as number;
}
function boolean(value: unknown) {
  if (typeof value !== "boolean") throw new Error("boolean");
  return value;
}
// Decode by copying an allowlist. Extra private server fields never cross IPC.
export function decodeCollectorMatch(input: unknown): CollectorMatch {
  try {
    const r = object(input),
      m = object(r.match);
    if (
      m.schemaVersion !== 1 ||
      m.mapId !== 11 ||
      m.gameType !== "CUSTOM_GAME" ||
      !Array.isArray(m.participants) ||
      m.participants.length !== 10
    )
      throw new Error("shape");
    const participants: Participant[] = m.participants.map((value: unknown) => {
      const p = object(value);
      if (
        ![100, 200].includes(p.teamId) ||
        !Array.isArray(p.items) ||
        p.items.length !== 7
      )
        throw new Error("participant");
      return {
        puuid: text(p.puuid),
        teamId: p.teamId,
        win: boolean(p.win),
        championId: integer(p.championId, 1),
        kills: integer(p.kills),
        deaths: integer(p.deaths),
        assists: integer(p.assists),
        championDamage: integer(p.championDamage),
        damageTaken: integer(p.damageTaken),
        laneCs: integer(p.laneCs),
        neutralCs: integer(p.neutralCs),
        goldEarned: integer(p.goldEarned),
        visionScore: integer(p.visionScore),
        objectiveDamage: integer(p.objectiveDamage),
        turretDamage: integer(p.turretDamage),
        items: p.items.map((v: unknown) => integer(v)),
      };
    });
    if (new Set(participants.map((p) => p.puuid)).size !== 10)
      throw new Error("identity");
    for (const team of [100, 200]) {
      const ps = participants.filter((p) => p.teamId === team);
      if (ps.length !== 5 || new Set(ps.map((p) => p.win)).size !== 1)
        throw new Error("team");
    }
    if (new Set(participants.map((p) => p.win)).size !== 2)
      throw new Error("winner");
    const platformId = text(m.platformId, 16),
      gameId = text(m.gameId, 30),
      startedAtUtc = text(m.startedAtUtc);
    if (
      !/^[A-Z0-9]+$/.test(platformId) ||
      !/^\d+$/.test(gameId) ||
      !Number.isFinite(Date.parse(startedAtUtc))
    )
      throw new Error("id");
    const match: NormalizedMatch = {
      schemaVersion: 1,
      platformId,
      gameId,
      startedAtUtc,
      durationSeconds: integer(m.durationSeconds, 1),
      mapId: 11,
      gameType: "CUSTOM_GAME",
      patch: text(m.patch),
      participants,
    };
    if (
      r.matchKey !== platformId + ":" + gameId ||
      !["pending", "registered", "canceled"].includes(r.state)
    )
      throw new Error("state");
    let confirmedRoles = null;
    if (r.confirmedRoles !== null) {
      validateRoles(match, r.confirmedRoles);
      confirmedRoles = Object.fromEntries(
        participants.map((p) => [p.puuid, r.confirmedRoles[p.puuid]]),
      );
    }
    if (r.state === "registered" && confirmedRoles === null)
      throw new Error("roles");
    return { matchKey: r.matchKey, state: r.state, match, confirmedRoles };
  } catch {
    throw new ClientError("INVALID_SERVER_RESPONSE", 502);
  }
}
export function decodeMembers(input: unknown): Member[] {
  try {
    if (!Array.isArray(input)) throw new Error("members");
    const members = input.map((v) => {
      const m = object(v);
      return {
        id: text(m.id),
        puuid: text(m.puuid),
        displayName: text(m.displayName),
        riotId: text(m.riotId),
        active: boolean(m.active),
      };
    });
    if (
      new Set(members.map((m) => m.id)).size !== members.length ||
      new Set(members.map((m) => m.puuid)).size !== members.length
    )
      throw new Error("duplicate");
    return members;
  } catch {
    throw new ClientError("INVALID_SERVER_RESPONSE", 502);
  }
}
