import type { MatchView } from "../preload/collector-api";
import { message } from "./messages";
const labels = {
  queued: "전송 순서를 기다리는 중입니다.",
  sending: "서버에 기록을 보내는 중입니다.",
  checking: "서버에서 등록 결과를 확인하는 중입니다.",
  retry_wait:
    "서버 연결을 확인하지 못했습니다. 잠시 후 다시 시도합니다. 이미 등록되었을 수 있어 결과부터 확인합니다.",
  action_required: "전송이 멈췄습니다. 안내에 따라 문제를 해결해 주세요.",
  done: "서버에서 수신 결과를 확인했습니다.",
};
const calc = {
  queued: "점수·랭킹 계산 대기 중",
  running: "점수·랭킹 계산 중",
  ready: "점수·랭킹 반영 완료",
  failed:
    "경기 등록은 완료됐지만 점수·랭킹 계산에 문제가 있습니다. 운영자가 다시 계산할 수 있습니다.",
  unknown: "점수·랭킹의 현재 상태를 확인하지 못했습니다.",
};
export function MatchProgress({ record }: { record: MatchView }) {
  const p = record.transfer,
    e = record.evaluation;
  return (
    <div className="match-progress" role="status">
      {p && record.state !== "registered" && (
        <>
          <p>{labels[p.phase]}</p>
          {p.attempt > 0 && (
            <small>
              시도 {p.attempt}회
              {p.lastAttemptAt
                ? ` · 마지막 시도 ${new Date(p.lastAttemptAt).toLocaleString("ko-KR")}`
                : ""}
              {p.nextRetryAt
                ? ` · 다음 시도 ${new Date(p.nextRetryAt).toLocaleString("ko-KR")}`
                : ""}
            </small>
          )}
          {p.errorCode && <small>{message(p.errorCode)}</small>}
        </>
      )}
      {record.state === "registered" && (
        <>
          <p>{calc[e?.status ?? "unknown"]}</p>
          {e?.observedAt && (
            <small>
              마지막 서버 확인: {new Date(e.observedAt).toLocaleString("ko-KR")}
            </small>
          )}
        </>
      )}
    </div>
  );
}
