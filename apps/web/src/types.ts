import type { Role, Participant } from "../../../packages/contracts/src";
export type { Role };
export interface PublicMember {
  id: string;
  displayName: string;
  active: boolean;
  primaryRole: Role | null;
  secondaryRole: Role | null;
  allowedRoles: Role[];
}
export interface AdminMember extends PublicMember {
  puuid: string;
  riotId: string;
  seedSkill: number;
  profileRevision: number;
}
export interface PublicParticipant extends Omit<Participant, "puuid"> {
  memberId: string;
  displayName: string;
  role: Role;
}
export interface Score {
  matchKey: string;
  memberId: string;
  role: Role;
  scoringVersion: string;
  score: number;
  rank: number;
  breakdown: Record<string, number>;
}
export interface Match {
  matchKey: string;
  startedAtUtc: string;
  durationSeconds: number;
  patch: string;
  participants: PublicParticipant[];
  evaluationStatus: string;
  scoringVersion: string | null;
  sourceRevision: number;
  generationId: string | null;
  scores: Score[];
}
export interface MatchPage {
  items: Match[];
  nextCursor: string | null;
}
export interface RecordStats {
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
  perfect: boolean;
}
export interface MemberStats extends RecordStats {
  memberId: string;
  adjustedScore: number | null;
  rank: number | null;
  status: string;
  winRate: number;
  byRole: Record<string, RecordStats>;
  byChampion: Record<string, RecordStats>;
}
export interface Rankings {
  status: string;
  generationId: string;
  sourceRevision: number;
  scoringVersion: string;
  members: { displayName: string; stats: MemberStats }[];
}
export interface Profile {
  member: PublicMember;
  stats: MemberStats;
  sourceRevision: number;
  scoringVersion: string;
}
export interface TeamSeat {
  memberId: string;
  role: Role;
}
export interface Recommendation {
  candidates: {
    teamA: TeamSeat[];
    teamB: TeamSeat[];
    skillDifference: number;
  }[];
  reason: string | null;
  sourceRevision: number;
}
export interface Catalog {
  version: string;
  baseUrl: string;
  champions: Record<string, { name: string; image: string }>;
  items: Record<string, { name: string; image: string }>;
}
export interface Suggestion {
  primary: Role | null;
  secondary: Role | null;
  sampleCount: number;
  sources: Record<string, number>;
  reason: string;
}
export interface Rules {
  id: string;
  algorithmVersion: string;
  weightsByRole: Record<Role, Record<string, number>>;
  metricMix: Record<string, number>;
  normalization: Record<string, number>;
  cumulativePrior: number;
}
