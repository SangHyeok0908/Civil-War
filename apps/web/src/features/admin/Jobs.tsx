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
  errorCode: string | null;
};
const label: Record<string, string> = {
  pending: "대기",
  running: "계산 중",
  succeeded: "완료",
  stale: "최신 변경으로 폐기",
  failed: "실패",
};
export function Jobs() {
  const r = useRemote<Job[]>("/api/admin/recalculation/jobs");
  const [error, setError] = useState<unknown>();
  return (
    <>
      <div className="section-heading">
        <h2>재계산 작업</h2>
        <div className="action-row">
          <button className="secondary" onClick={r.reload}>
            작업 새로고침
          </button>
          <button
            onClick={async () => {
              try {
                await api("/api/admin/recalculation/retry", "POST");
                r.reload();
              } catch (e) {
                setError(e);
              }
            }}
          >
            실패한 최신 작업 재시도
          </button>
        </div>
      </div>
      <p className="caption">
        완성된 최신 세대만 공개됩니다. 실패하거나 오래된 계산은 공개 점수에
        섞이지 않습니다.
      </p>
      {error !== undefined && <ErrorBox error={error} />}{" "}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox error={r.error} />
      ) : !r.data?.length ? (
        <Empty />
      ) : (
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "자료 버전",
                  "평가 기준",
                  "상태",
                  "시도",
                  "생성 시각",
                  "오류",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.data.map((j) => (
                <tr key={j.id}>
                  <td>{j.sourceRevision}</td>
                  <td>{j.scoringVersion || "대기"}</td>
                  <td>
                    <span
                      className={
                        "badge " + (j.status === "succeeded" ? "cyan" : "amber")
                      }
                    >
                      {label[j.status] || j.status}
                    </span>
                  </td>
                  <td>{j.attempts}</td>
                  <td>{kst(j.createdAt)}</td>
                  <td>{j.errorCode || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
