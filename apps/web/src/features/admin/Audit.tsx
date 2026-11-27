import { useRemote } from "../../api";
import type { CollectorMatch } from "../../../../../packages/contracts/src";
import type { AdminMember } from "../../types";
import {
  Loading,
  ErrorBox,
  Empty,
  kst,
  roleName,
} from "../../components/Common";
export type AuditEntry = {
  id: string;
  action: string;
  targetId?: string;
  actorId: string;
  createdAt: string;
  details: unknown;
};
type Names = {
  members?: AdminMember[];
  /** Match key -> start time, so a match is shown by its date instead of its key. */
  matchStartedAt?: Record<string, string>;
};
const actionName: Record<string, string> = {
  match_ingested: "경기 자료 수집",
  match_registered: "경기 등록",
  match_canceled: "경기 등록 취소",
  roles_corrected: "포지션 정정",
  member_created: "참가자 추가",
  member_updated: "참가자 정보 수정",
  account_linked: "게임 계정 연결",
  rank_seed_updated: "솔로랭크 등급 갱신",
  references_imported: "포지션 참고 자료 가져오기",
  admin_login: "운영자 로그인",
  auth_revoked: "인증 폐기",
  collector_enrolled: "수집기 연결",
  group_code_replaced: "모임 코드 발급",
  group_code_deleted: "모임 코드 삭제",
  scoring_version_created: "평가 기준 새 버전 저장",
  recalculation_retry: "점수 재계산 다시 시도",
};
const matchActions = new Set([
  "match_ingested",
  "match_registered",
  "match_canceled",
  "roles_corrected",
]);
const memberActions = new Set([
  "member_created",
  "member_updated",
  "account_linked",
  "rank_seed_updated",
  "references_imported",
]);
// The audit list stores details as text while the match detail sends an object.
function parseDetails(details: unknown): Record<string, unknown> {
  let value = details;
  if (typeof details === "string") {
    try {
      value = JSON.parse(details);
    } catch {
      return { 원문: details };
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function memberName(id: string | undefined, names: Names) {
  return names.members?.find((m) => m.id === id)?.displayName;
}
function actor(a: AuditEntry, names: Names) {
  if (a.actorId === "owner") return "운영자";
  if (a.actorId === "server") return "서버 (자동)";
  if (a.actorId === "collector") return "수집기 (자동)";
  return memberName(a.actorId, names) ?? "참가자";
}
function target(a: AuditEntry, details: Record<string, unknown>, names: Names) {
  if (matchActions.has(a.action)) {
    const startedAt = a.targetId && names.matchStartedAt?.[a.targetId];
    return startedAt ? kst(startedAt) + " 경기" : "경기";
  }
  if (memberActions.has(a.action))
    return memberName(a.targetId, names) ?? "목록에 없는 참가자";
  if (a.action === "admin_login") return "운영자 브라우저";
  if (a.action === "auth_revoked")
    return details.kind === "sessions"
      ? "운영자 브라우저 인증"
      : "수집자 기기 인증";
  if (a.action === "collector_enrolled")
    return (memberName(a.actorId, names) ?? "참가자") + "의 수집기";
  if (a.action.startsWith("group_code_")) return "모임 코드";
  if (a.action === "recalculation_retry") return "전체 점수";
  return a.targetId || "—";
}
function changes(
  a: AuditEntry,
  details: Record<string, unknown>,
  names: Names,
): { lines: string[]; raw?: string } {
  if (a.action === "roles_corrected") {
    const before = (details.before ?? {}) as Record<string, string>;
    const after = (details.after ?? {}) as Record<string, string>;
    return {
      lines: Object.keys(after)
        .filter((id) => before[id] !== after[id])
        .map(
          (id) =>
            `${memberName(id, names) ?? "게스트"}: ${roleName[before[id]] ?? "미확정"} → ${roleName[after[id]] ?? "미확정"}`,
        ),
    };
  }
  if (a.action === "references_imported")
    return { lines: [`참고 자료 ${details.count ?? 0}건`] };
  // Already shown as the target, or an internal counter that tells the operator nothing.
  if (a.action === "auth_revoked" || a.action === "member_updated")
    return { lines: [] };
  return Object.keys(details).length
    ? { lines: [], raw: JSON.stringify(details, null, 2) }
    : { lines: [] };
}
export function AuditTable({
  entries,
  names,
  showTarget = true,
}: {
  entries: AuditEntry[];
  names: Names;
  showTarget?: boolean;
}) {
  return !entries.length ? (
    <Empty>아직 남은 변경 이력이 없습니다.</Empty>
  ) : (
    <div className="table-scroll">
      <table className="audit">
        <thead>
          <tr>
            <th>시간</th>
            <th>작업</th>
            <th>누가</th>
            <th>{showTarget ? "대상과 변경 내용" : "변경 내용"}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((a) => {
            const details = parseDetails(a.details);
            const { lines, raw } = changes(a, details, names);
            return (
              <tr key={a.id}>
                <td className="nowrap">{kst(a.createdAt)}</td>
                <td className="nowrap" title={a.action}>
                  {actionName[a.action] ?? a.action}
                </td>
                <td className="nowrap">{actor(a, names)}</td>
                <td>
                  {showTarget && <span>{target(a, details, names)}</span>}
                  {lines.length > 0 && (
                    <ul className="audit-changes">
                      {lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                  {raw && (
                    <details>
                      <summary>자세한 내용</summary>
                      <pre>{raw}</pre>
                    </details>
                  )}
                  {!showTarget && !lines.length && !raw && (
                    <span className="subtle">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
export function Audit() {
  const r = useRemote<AuditEntry[]>("/api/admin/audit");
  const members = useRemote<AdminMember[]>("/api/admin/members");
  // The audit entry only stores the match key, so the three state lists supply the dates.
  const registered = useRemote<CollectorMatch[]>(
    "/api/admin/matches?state=registered",
  );
  const pending = useRemote<CollectorMatch[]>(
    "/api/admin/matches?state=pending",
  );
  const canceled = useRemote<CollectorMatch[]>(
    "/api/admin/matches?state=canceled",
  );
  const matchStartedAt = Object.fromEntries(
    [registered, pending, canceled].flatMap((list) =>
      (list.data ?? []).map((m) => [m.matchKey, m.match.startedAtUtc]),
    ),
  );
  return (
    <>
      <h2>최근 변경 이력</h2>
      <p className="caption">
        누가 언제 무엇을 바꾸었는지 최근 100건을 최신순으로 보여 줍니다.
      </p>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox error={r.error} retry={r.reload} />
      ) : (
        <div className="panel">
          <AuditTable
            entries={r.data || []}
            names={{ members: members.data, matchStartedAt }}
          />
        </div>
      )}
    </>
  );
}
