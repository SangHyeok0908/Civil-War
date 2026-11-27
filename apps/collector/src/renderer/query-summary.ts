import type { HistorySyncResult } from "../preload/collector-api";
import { message } from "./messages";
// 내전이 아닌 경기를 걸러낸 정상 결과다. 오류와 구분해 안내한다.
const EXCLUSIONS: Record<string, string> = {
  UNSUPPORTED_SCHEMA: "내전 형식(사용자 설정 5대5)이 아닌 경기",
  INSUFFICIENT_REGISTERED_PARTICIPANTS: "등록 참가자가 6명 미만인 경기",
};
export interface QueryReason {
  code: string;
  count: number;
  text: string;
}
export interface QuerySummary {
  total: number;
  candidates: number;
  excluded: QueryReason[];
  problems: QueryReason[];
  headline: string;
  warning: string | null;
}
export function summarizeQuery(
  results: HistorySyncResult["results"],
  warningCode: string | null,
): QuerySummary {
  const counts = new Map<string, number>();
  for (const { code } of results)
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  const excluded: QueryReason[] = [];
  const problems: QueryReason[] = [];
  for (const [code, count] of counts) {
    if (EXCLUSIONS[code])
      excluded.push({ code, count, text: EXCLUSIONS[code] });
    else problems.push({ code, count, text: message(code) });
  }
  const sum = (rows: QueryReason[]) => rows.reduce((n, r) => n + r.count, 0);
  const candidates = results.filter((r) => !r.code).length;
  const parts = [`내전 후보 ${candidates}경기`];
  if (excluded.length) parts.push(`제외 ${sum(excluded)}경기`);
  if (problems.length) parts.push(`문제 ${sum(problems)}경기`);
  return {
    total: results.length,
    candidates,
    excluded,
    problems,
    headline: results.length
      ? `롤 기록 ${results.length}경기를 확인했습니다. ${parts.join(", ")}입니다.`
      : "롤 클라이언트에서 조회된 경기가 없습니다.",
    warning: warningCode ? message(warningCode) : null,
  };
}
