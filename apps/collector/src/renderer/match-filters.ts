import type { DisplayState, MatchView } from "../preload/collector-api";
export const FILTERS = [
  "전체",
  "전송 대기",
  "확인 대기",
  "등록 진행 중",
  "등록 완료",
  "등록 취소",
  "문제 해결 필요",
] as const;
export type MatchFilter = DisplayState | "전체";
export function selectMatches(matches: MatchView[], filter: MatchFilter) {
  return matches
    .filter((m) => filter === "전체" || m.status === filter)
    .sort(
      (a, b) =>
        Date.parse(b.match.startedAtUtc) - Date.parse(a.match.startedAtUtc) ||
        (a.matchKey > b.matchKey ? -1 : a.matchKey < b.matchKey ? 1 : 0),
    );
}
