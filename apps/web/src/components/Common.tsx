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
  objective: "목표물 공격",
  deaths: "사망 보정",
  win: "승패",
};
export const tierNames: Record<string, string> = {
  IRON: "아이언",
  BRONZE: "브론즈",
  SILVER: "실버",
  GOLD: "골드",
  PLATINUM: "플래티넘",
  EMERALD: "에메랄드",
  DIAMOND: "다이아몬드",
  MASTER: "마스터",
  GRANDMASTER: "그랜드마스터",
  CHALLENGER: "챌린저",
};
export const number = (n: number) => n.toLocaleString("ko-KR");
export const score = (n: number | null | undefined) =>
  n == null ? "—" : (Math.round(n * 100) / 100).toFixed(2);
/** Riot's build number adds two parts nobody needs: 16.20.824.8524 -> 16.20. */
export const shortPatch = (patch: string) =>
  patch.split(".").slice(0, 2).join(".") || patch;
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
const errorMessages: Record<string, string> = {
  RECALCULATING: "기록을 다시 계산하고 있습니다. 잠시 후 다시 확인해 주세요.",
  AUTH_REVOKED:
    "인증이 만료되었거나 폐기되었습니다. 운영자 코드로 다시 로그인해 주세요.",
  RATE_LIMITED: "요청이 많습니다. 10분 후 다시 시도해 주세요.",
  NOT_FOUND: "기록을 찾을 수 없습니다.",
  INVALID_TEAM_MEMBERS: "서로 다른 활성 참가자 10명을 선택해 주세요.",
  NETWORK_ERROR:
    "서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  INVALID_RIOT_ID:
    "Riot ID 형식이 올바르지 않습니다. 게임 이름과 태그를 #으로 이어서 입력해 주세요. 예: 소환사이름#KR1",
  INVALID_MEMBER:
    "참가자 정보를 저장할 수 없습니다. 주 포지션과 부 포지션은 서로 달라야 하고, 둘 다 가능한 포지션에 체크되어 있어야 합니다.",
  CONFLICT:
    "이미 같은 값이 등록되어 있습니다. 중복된 항목이 없는지 확인해 주세요.",
  ACCOUNT_LINK_CONFLICT:
    "이 게임 계정은 이미 다른 참가자와 연결되어 있습니다. Riot ID를 다시 확인해 주세요.",
  INVALID_SCORING_RULES:
    "평가 기준을 저장할 수 없습니다. 포지션마다 합계가 100인지, 승패 가중치가 5 이하인지 확인해 주세요.",
  INVALID_MATCH:
    "포지션을 저장할 수 없습니다. 팀마다 다섯 포지션을 하나씩 지정해 주세요.",
  INVALID_STATE:
    "아직 확인 대기 중인 경기입니다. 등록이 끝난 경기만 정정하거나 취소할 수 있습니다.",
  MATCH_CANCELED: "이미 등록이 취소된 경기입니다.",
  GROUP_CODE_EXISTS:
    "모임 코드가 이미 발급되어 있습니다. 화면을 새로고침해 주세요.",
  GROUP_CODE_MISSING: "발급된 모임 코드가 없습니다. 화면을 새로고침해 주세요.",
  CODE_GENERATION_FAILED:
    "코드를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
  FORBIDDEN:
    "권한을 확인하지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.",
  CSRF_REJECTED:
    "보안 확인에 실패했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.",
  ORIGIN_REJECTED:
    "보안 확인에 실패했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.",
};
export function ErrorBox({
  error,
  retry,
  messages,
}: {
  error: unknown;
  retry?: () => void;
  /** Screen-specific wording for a code whose meaning depends on the action. */
  messages?: Record<string, string>;
}) {
  const code = error instanceof ApiFailure ? error.code : "UNKNOWN";
  const recalc = code === "RECALCULATING";
  const message =
    messages?.[code] ??
    errorMessages[code] ??
    "요청을 처리하지 못했습니다. 입력과 연결 상태를 확인해 주세요.";
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
  // Ranked is the normal state, so only the exceptions are labelled.
  if (status === "ranked") return null;
  return (
    <span className="badge amber">
      {status === "unrated" ? "기록 없음" : "평가 중"}
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
        점수에 포함되지 않습니다. Riot 공식 등급이 아닙니다.
      </p>
      <ObjectiveRuleNote />
      {version && <RuleWeights version={version} />}
    </details>
  );
}

export function ObjectiveRuleNote() {
  return (
    <p>
      목표물 공격은 탑은 분당 포탑 피해, 정글·미드·원딜·서포터는 분당 목표물
      피해로 평가합니다. 목표물 피해에는 포탑 피해가 포함되므로 두 피해량을
      더하거나 섞지 않습니다. 두 원본 수치는 각각 보존합니다.
    </p>
  );
}

function RuleWeights({ version }: { version: string }) {
  const r = useRemote<Rules>(
    "/api/scoring-versions/" + encodeURIComponent(version),
  );
  if (r.loading) return <Loading />;
  if (r.error) return <ErrorBox error={r.error} />;
  return (
    <WeightsTable ruleset={r.data!} caption="현재 버전의 역할별 가중치 (%)" />
  );
}

export function WeightsTable({
  ruleset,
  caption,
}: {
  ruleset: Rules;
  caption: string;
}) {
  const percent = (key: string) => Math.round(ruleset.metricMix[key] * 100);
  return (
    <>
      <div className="table-scroll">
        <table>
          <caption>{caption}</caption>
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
        피해량: 분당 피해 {percent("damagePerMinute")}% + 팀 피해 비중{" "}
        {percent("damageShare")}%. 성장: 분당 CS {percent("csPerMinute")}% +
        분당 골드 {percent("goldPerMinute")}%. 서포터 교전: 킬 관여{" "}
        {percent("supportParticipation")}% + 분당 어시스트{" "}
        {percent("supportAssists")}%.
      </p>
    </>
  );
}
