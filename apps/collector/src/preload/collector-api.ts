import type {
  NormalizedMatch,
  Role,
  MatchState,
} from "../../../../packages/contracts/src/index";
export type DisplayState =
  | "전송 대기"
  | "확인 대기"
  | "등록 대기"
  | "등록 완료"
  | "등록 취소"
  | "확인 필요";
export interface SafeAccount {
  connected: boolean;
  displayName: string | null;
  enrolled: boolean;
  code: string | null;
}
export interface MatchView {
  matchKey: string;
  state: MatchState;
  status: DisplayState;
  match: NormalizedMatch;
  roles: Record<string, Role>;
  names: Record<string, string>;
  error: string | null;
}
export interface Snapshot {
  account: SafeAccount;
  matches: MatchView[];
  serverError: string | null;
}
export interface HistorySyncResult {
  results: { matchKey: string | null; code: string | null }[];
  warningCode: string | null;
  snapshot: Snapshot;
}
export interface CollectorApi {
  getAccount(): Promise<SafeAccount>;
  snapshot(): Promise<Snapshot>;
  enroll(code: string): Promise<Snapshot>;
  queryPastMatches(): Promise<HistorySyncResult>;
  loadPendingMatches(): Promise<Snapshot>;
  saveDraft(
    matchKey: string,
    rolesByPuuid: Record<string, Role>,
  ): Promise<Snapshot>;
  confirmRegistration(
    matchKey: string,
    rolesByPuuid: Record<string, Role>,
    inhouse: boolean,
  ): Promise<Snapshot>;
  resumeOwnRequests(): Promise<Snapshot>;
  exportMemberReferences(
    selection: string[],
  ): Promise<{ available: false; code: string; reason: string }>;
}
declare global {
  interface Window {
    collector: CollectorApi;
  }
}
