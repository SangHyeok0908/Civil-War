import type { ReactNode } from "react";
import { ApiFailure, useRemote } from "../api";
import type { RecordStats, Rules } from "../types";
export const roles = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export const roleName: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MIDDLE: "미드",
  BOTTOM: "원딜",
  UTILITY: "서포터",
};
export const metricName: Record<string, string> = {
  damage: "피해량",
  growth: "성장",
  combat: "교전",
  vision: "시야",
  objective: "오브젝트",
  deaths: "사망 보정",
  win: "승패",
};
export const number = (n: number) => n.toLocaleString("ko-KR");
export const score = (n: number | null | undefined) =>
  n == null ? "—" : (Math.round(n * 100) / 100).toFixed(2);
export const kst = (date: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date)) + " KST";
export function Kda({
  stats,
}: {
  stats: Pick<RecordStats, "kills" | "deaths" | "assists">;
}) {
  return (
    <span>
      {stats.kills} / {stats.deaths} / {stats.assists}{" "}
      <small>
        {stats.deaths === 0
          ? "Perfect"
          : ((stats.kills + stats.assists) / stats.deaths).toFixed(2) + " KDA"}
      </small>
    </span>
  );
}
export function Heading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
export function Empty({
  children = "아직 등록된 기록이 없습니다.",
}: {
  children?: ReactNode;
}) {
  return <div className="empty">{children}</div>;
}
export function Loading() {
  return (
    <div className="notice" role="status">
      기록을 불러오는 중입니다…
    </div>
  );
}
export function ErrorBox({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const code = error instanceof ApiFailure ? error.code : "UNKNOWN";
  const recalc = code === "RECALCULATING";
  const message = recalc
    ? "기록을 다시 계산하고 있습니다. 잠시 후 다시 확인해 주세요."
    : code === "AUTH_REVOKED"
      ? "인증이 만료되었거나 폐기되었습니다. 운영자 코드로 다시 로그인해 주세요."
      : code === "RATE_LIMITED"
        ? "요청이 많습니다. 10분 후 다시 시도해 주세요."
        : code === "NOT_FOUND"
          ? "기록을 찾을 수 없습니다."
          : code === "INVALID_TEAM_MEMBERS"
            ? "서로 다른 활성 참가자 10명을 선택해 주세요."
            : "요청을 처리하지 못했습니다. 입력과 연결 상태를 확인해 주세요.";
  return (
    <div
      className={"notice " + (recalc ? "amber" : "error")}
      role={recalc ? "status" : "alert"}
    >
      <strong>{recalc ? "계산 중" : "확인 필요"}</strong>
      <p>{message}</p>
      {!recalc && <small>{code}</small>}
      {retry && (
        <button className="secondary" onClick={retry}>
          다시 시도
        </button>
      )}
    </div>
  );
}
export function Status({ status }: { status: string }) {
  return (
    <span className={"badge " + (status === "ranked" ? "cyan" : "amber")}>
      {status === "ranked"
        ? "정식 랭킹"
        : status === "unrated"
          ? "기록 없음"
          : "평가 중"}
    </span>
  );
}
export function RuleNote({ version }: { version?: string | null }) {
  return (
    <details className="rule-note">
      <summary>평가 기준 · {version || "계산 중"}</summary>
      <p>
        같은 포지션의 경기 상대와 등록된 내전 기록을 비교합니다. 새 경기 등록 시
        과거 점수도 함께 바뀝니다. 누적 점수는 모임 평균 5경기분으로 보정하며
        3경기부터 정식 랭킹입니다. 표시 점수가 같으면 공동 순위입니다.
      </p>
      <p>
        받은 피해량과 KDA는 직접 가산하지 않습니다. 솔로랭크·초기 실력은 공개
        점수에 포함되지 않습니다. 현재 오브젝트 기준은 잠정 기준으로, 탑은 포탑
        피해량, 나머지 역할은 오브젝트 피해량을 사용합니다. Riot 공식 등급이
        아닙니다.
      </p>
      {version && <RuleWeights version={version} />}
    </details>
  );
}

function RuleWeights({ version }: { version: string }) {
  const r = useRemote<Rules>(
    "/api/scoring-versions/" + encodeURIComponent(version),
  );
  if (r.loading) return <Loading />;
  if (r.error) return <ErrorBox error={r.error} />;
  const ruleset = r.data!;
  return (
    <>
      <div className="table-scroll">
        <table>
          <caption>현재 버전의 역할별 가중치 (%)</caption>
          <thead>
            <tr>
              <th>역할</th>
              {Object.values(metricName).map((n) => (
                <th key={n}>{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role}>
                <th>{roleName[role]}</th>
                {Object.keys(metricName).map((metric) => (
                  <td key={metric}>{ruleset.weightsByRole[role][metric]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        피해량: 분당 피해 {Math.round(ruleset.metricMix.damagePerMinute * 100)}%
        + 팀 피해 비중 {Math.round(ruleset.metricMix.damageShare * 100)}%. 성장:
        분당 CS {Math.round(ruleset.metricMix.csPerMinute * 100)}% + 분당 골드{" "}
        {Math.round(ruleset.metricMix.goldPerMinute * 100)}%. 서포터 교전: 킬
        관여 {Math.round(ruleset.metricMix.supportParticipation * 100)}% + 분당
        어시스트 {Math.round(ruleset.metricMix.supportAssists * 100)}%.
      </p>
    </>
  );
}
