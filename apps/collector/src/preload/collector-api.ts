import type {
  NormalizedMatch,
  Role,
  MatchState,
} from "../../../../packages/contracts/src/index";
export const DISPLAY_STATES = {
  upload_pending: "전송 대기",
  review_pending: "확인 대기",
  registering: "등록 진행 중",
  registered: "등록 완료",
  canceled: "등록 취소",
  action_required: "문제 해결 필요",
} as const;
export type MatchCategory = keyof typeof DISPLAY_STATES;
export type DisplayState = (typeof DISPLAY_STATES)[MatchCategory];
export interface SafeAccount {
  connected: boolean;
  displayName: string | null;
  expectedDisplayName?: string | null;
  enrolled: boolean;
  code: string | null;
}
export interface MatchView {
  matchKey: string;
  state: MatchState;
  status: DisplayState;
  category: MatchCategory;
  match: NormalizedMatch;
  roles: Record<string, Role>;
  manualRoles?: Record<string, Role | null>;
  roleSuggestions?: import("../../../../packages/contracts/src/index").RoleSuggestion[];
  names: Record<string, string>;
  error: string | null;
  transfer?: import("../../../../packages/contracts/src/index").TransferProgress;
  evaluation?: import("../../../../packages/contracts/src/index").EvaluationProgress;
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
    rolesByPuuid: Record<string, Role | null>,
  ): Promise<Snapshot>;
  confirmRegistration(
    matchKey: string,
    rolesByPuuid: Record<string, Role>,
    inhouse: boolean,
  ): Promise<Snapshot>;
  exportMemberReferences(
    selection: string[],
  ): Promise<{ available: false; code: string; reason: string }>;
}
declare global {
  interface Window {
    collector: CollectorApi;
  }
}
