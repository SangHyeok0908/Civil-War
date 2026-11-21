import {
  ROLES,
  type Role,
  type RoleSuggestion,
} from "../../contracts/src/index";
export interface MatchRoleEvidence {
  puuid: string;
  teamId: number;
  teamPosition?: string;
  lane?: string;
  role?: string;
}
export function suggestMatchRoles(rows: MatchRoleEvidence[]): RoleSuggestion[] {
  const hints = rows.map((p) => {
    const direct = ROLES.includes(p.teamPosition as Role)
      ? (p.teamPosition as Role)
      : null;
    const lane = p.lane?.toUpperCase(),
      role = p.role?.toUpperCase();
    const pair: Role | null =
      lane === "TOP" && role === "SOLO"
        ? "TOP"
        : (lane === "MIDDLE" || lane === "MID") && role === "SOLO"
          ? "MIDDLE"
          : lane === "JUNGLE" && (role === "NONE" || role === "JUNGLE")
            ? "JUNGLE"
            : lane === "BOTTOM" && (role === "DUO_CARRY" || role === "CARRY")
              ? "BOTTOM"
              : lane === "BOTTOM" &&
                  (role === "DUO_SUPPORT" || role === "SUPPORT")
                ? "UTILITY"
                : null;
    return direct && pair && direct !== pair ? null : (direct ?? pair);
  });
  return rows.map((p, i) => {
    const candidate = hints[i];
    const conflict =
      candidate &&
      rows.some(
        (q, j) => j !== i && p.teamId === q.teamId && hints[j] === candidate,
      );
    const role = conflict ? null : candidate;
    return {
      puuid: p.puuid,
      role,
      source: role ? "match" : "none",
      reason: conflict
        ? "duplicate_role"
        : role
          ? "explicit_match_evidence"
          : "insufficient_evidence",
    };
  });
}
export function rawRoleSuggestions(raw: any): RoleSuggestion[] {
  if (
    !Array.isArray(raw?.participants) ||
    !Array.isArray(raw?.participantIdentities)
  )
    return [];
  return suggestMatchRoles(
    raw.participants
      .map((p: any) => ({
        puuid: raw.participantIdentities.find(
          (x: any) => x.participantId === p.participantId,
        )?.player?.puuid,
        teamId: p.teamId,
        teamPosition: p.teamPosition ?? p.stats?.teamPosition,
        lane: p.timeline?.lane,
        role: p.timeline?.role,
      }))
      .filter((p: MatchRoleEvidence) => typeof p.puuid === "string"),
  );
}
