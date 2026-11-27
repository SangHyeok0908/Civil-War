import { useState } from "react";
import { api, useRemote } from "../../api";
import { Loading, ErrorBox, Empty, kst } from "../../components/Common";
type Job = {
  id: string;
  sourceRevision: number;
  scoringVersion: string | null;
  status: string;
  attempts: number;
  createdAt: string;
  completedAt: string | null;
  errorCode: string | null;
};
const label: Record<string, string> = {
  pending: "계산 대기",
  running: "계산 중",
  succeeded: "완료",
  stale: "건너뜀",
  failed: "실패",
};
const working = (job?: Job) =>
  job?.status === "pending" || job?.status === "running";
// While the newest calculation is unfinished the list refreshes itself.
const isPending = (jobs: Job[]) => working(jobs[0]);
export function Jobs() {
  const r = useRemote<Job[]>("/api/admin/recalculation/jobs", isPending);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const latest = r.data?.[0];
  async function retry() {
    setBusy(true);
    setError(undefined);
    try {
      await api("/api/admin/recalculation/retry", "POST");
      r.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-heading">
        <h2>점수 재계산 현황</h2>
        <button
          className="secondary"
          disabled={r.refreshing}
          onClick={r.reload}
        >
          새로고침
        </button>
      </div>
      <p className="caption">
        경기 등록, 포지션 정정, 등록 취소, 평가 기준 변경, 참가자의 포지션
        변경이 생기면 서버가 모든 경기의 점수와 랭킹을 자동으로 다시 계산합니다.
        직접 실행할 일은 없으며, 계산이 실패했을 때만 이 화면에서 다시
        시도합니다.
      </p>
      {error !== undefined && <ErrorBox error={error} />}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox error={r.error} retry={r.reload} />
      ) : !latest ? (
        <Empty>
          아직 점수를 계산한 적이 없습니다. 첫 경기가 등록되면 자동으로
          계산합니다.
        </Empty>
      ) : (
        <>
          <div
            className={
              "notice job-summary " +
              (latest.status === "failed"
                ? "error"
                : working(latest)
                  ? "amber"
                  : "")
            }
            role="status"
          >
            {latest.status === "succeeded" ? (
              <>
                <strong>점수가 최신 상태입니다</strong>
                <p>
                  마지막 계산: {kst(latest.completedAt ?? latest.createdAt)}
                  {latest.scoringVersion &&
                    ` · 평가 기준 ${latest.scoringVersion}`}
                </p>
              </>
            ) : latest.status === "failed" ? (
              <>
                <strong>점수 계산에 실패했습니다</strong>
                <p>
                  공개 화면의 점수와 랭킹은 계산이 끝날 때까지 ‘계산 중’으로
                  표시됩니다. 다시 시도해도 실패하면 서버 기록을 확인해야
                  합니다.
                </p>
                <button disabled={busy} onClick={retry}>
                  {busy ? "요청하는 중…" : "다시 계산"}
                </button>
              </>
            ) : (
              <>
                <strong>점수를 다시 계산하고 있습니다</strong>
                <p>
                  끝날 때까지 공개 화면의 점수와 랭킹은 ‘계산 중’으로
                  표시됩니다. 이 화면은 자동으로 새로 고쳐집니다.
                </p>
              </>
            )}
          </div>
          <h3 className="section-title">계산 기록</h3>
          <p className="caption">
            한 줄이 계산 한 번입니다. 계산하는 동안 새 변경이 생기면 그 계산은
            건너뛰고 최신 자료로 다시 계산합니다.
          </p>
          <div className="panel table-scroll">
            <table>
              <thead>
                <tr>
                  <th>계산을 시작한 때</th>
                  <th>결과</th>
                  <th>적용한 평가 기준</th>
                </tr>
              </thead>
              <tbody>
                {r.data!.map((j) => (
                  <tr key={j.id}>
                    <td className="nowrap">{kst(j.createdAt)}</td>
                    <td>
                      <span
                        className={
                          "badge " +
                          (j.status === "succeeded" ? "cyan" : "amber")
                        }
                      >
                        {label[j.status] || j.status}
                      </span>
                      {j.attempts > 1 && (
                        <small>{j.attempts}번 시도했습니다</small>
                      )}
                      {j.errorCode && <small>오류 코드 {j.errorCode}</small>}
                    </td>
                    <td>{j.scoringVersion || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
