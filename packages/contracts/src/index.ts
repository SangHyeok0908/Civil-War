export const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export type Role = (typeof ROLES)[number];
export type MatchState = "pending" | "registered" | "canceled";
export interface CollectorPrincipal {
  memberId: string;
  credentialId: string;
  puuid: string;
}
export interface Credential extends CollectorPrincipal {
  token: string;
}
export interface Member {
  id: string;
  puuid: string;
  displayName: string;
  riotId: string;
  active: boolean;
}
export interface Participant {
  puuid: string;
  teamId: 100 | 200;
  win: boolean;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
  championDamage: number;
  damageTaken: number;
  laneCs: number;
  neutralCs: number;
  goldEarned: number;
  visionScore: number;
  objectiveDamage: number;
  turretDamage: number;
  items: number[];
}
export interface NormalizedMatch {
  schemaVersion: 1;
  platformId: string;
  gameId: string;
  startedAtUtc: string;
  durationSeconds: number;
  mapId: 11;
  gameType: "CUSTOM_GAME";
  patch: string;
  participants: Participant[];
}
export interface CollectorMatch {
  matchKey: string;
  state: MatchState;
  match: NormalizedMatch;
  confirmedRoles: Record<string, Role> | null;
}
export interface IngestMatchInput {
  schemaVersion: 1;
  rawMatch: unknown;
  rawJson?: string;
  clientSubmissionId: string;
}
export interface ConfirmationInput {
  rolesByPuuid: Record<string, Role>;
  clientSubmissionId: string;
}
export interface RoleReferenceSample {
  puuid: string;
  source: "solo420";
  gameId: string;
  playedAt: string;
  role: Role;
  evidence: {
    officialPuuid: string;
    queueId: 420;
    teamPosition: Role;
    durationSeconds: number;
    earlyEnded: false;
  };
}
export class ClientError extends Error {
  constructor(
    public code: string,
    public status = 0,
    public retryAfter = 0,
  ) {
    super(code);
  }
}
export function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ClientError("INVALID_REQUEST");
  return value as Record<string, any>;
}
export function text(value: unknown, max = 255): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new ClientError("INVALID_REQUEST");
  return value;
}
export function validateRoles(
  match: NormalizedMatch,
  roles: unknown,
): asserts roles is Record<string, Role> {
  const r = object(roles);
  if (Object.keys(r).length !== 10 || match.participants.length !== 10)
    throw new ClientError("INVALID_ROLES");
  for (const team of [100, 200]) {
    const players = match.participants.filter((p) => p.teamId === team);
    if (
      players.length !== 5 ||
      new Set(players.map((p) => r[p.puuid])).size !== 5 ||
      players.some((p) => !ROLES.includes(r[p.puuid]))
    )
      throw new ClientError("INVALID_ROLES");
  }
}
