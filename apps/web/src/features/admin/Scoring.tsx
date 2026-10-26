import { useEffect, useState } from "react";
import { api, useRemote } from "../../api";
import type { Rules } from "../../types";
import {
  roles,
  roleName,
  metricName,
  Loading,
  ErrorBox,
  Empty,
  ObjectiveRuleNote,
} from "../../components/Common";
export function Scoring() {
  const r = useRemote<Rules[]>("/api/admin/scoring-versions");
  const [draft, setDraft] = useState<Rules>();
  const [id, setId] = useState("");
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (r.data?.length) setDraft(structuredClone(r.data.at(-1)));
  }, [r.data]);
  return (
    <>
      <h2>평가 기준 새 버전</h2>
      <p className="lead">
        역할별 합계는 100, 승패 가중치는 최대 5입니다. 저장하면 과거 유효 경기
        전체를 같은 기준으로 재계산합니다.
      </p>
      <ObjectiveRuleNote />
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox error={r.error} />
      ) : !draft ? (
        <Empty>
          기본 평가 기준을 준비하고 있습니다.{" "}
          <button onClick={r.reload}>새로고침</button>
        </Empty>
      ) : (
        <form
          className="panel editor form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(undefined);
            try {
              await api("/api/admin/scoring-versions", "POST", {
                ...draft,
                id,
              });
              setNotice(
                "새 평가 기준을 저장했습니다. 전체 기록을 다시 계산합니다.",
              );
              setId("");
              r.reload();
            } catch (e) {
              setError(e);
            }
          }}
        >
          <label>
            새 버전 ID
            <input
              required
              pattern="[A-Za-z0-9_-]{1,100}"
              value={id}
              placeholder="inhouse-v2"
              onChange={(e) => setId(e.target.value)}
            />
          </label>
          <div className="table-scroll">
            <table className="weights">
              <thead>
                <tr>
                  <th>포지션</th>
                  {Object.values(metricName).map((m) => (
                    <th key={m}>{m}</th>
                  ))}
                  <th>합계</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role}>
                    <th>{roleName[role]}</th>
                    {Object.keys(metricName).map((key) => (
                      <td key={key}>
                        <input
                          aria-label={
                            roleName[role] + " " + metricName[key] + " 가중치"
                          }
                          type="number"
                          min="0"
                          max={key === "win" ? 5 : 100}
                          step="0.1"
                          value={draft.weightsByRole[role][key]}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              weightsByRole: {
                                ...draft.weightsByRole,
                                [role]: {
                                  ...draft.weightsByRole[role],
                                  [key]: Number(e.target.value),
                                },
                              },
                            })
                          }
                        />
                      </td>
                    ))}
                    <td>
                      {Object.values(draft.weightsByRole[role])
                        .reduce((a, b) => a + b, 0)
                        .toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>항목 내부 비율과 고정 표준화 상수</summary>
            <div className="form-grid">
              {Object.entries(draft.metricMix).map(([key, value]) => (
                <label key={key}>
                  {key}
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={value}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        metricMix: {
                          ...draft.metricMix,
                          [key]: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <p className="caption">
              피해량·성장·서포터 교전의 두 내부 비율 합은 각각 1이어야 합니다.
            </p>
            <pre>
              {JSON.stringify(
                {
                  algorithmVersion: draft.algorithmVersion,
                  normalization: draft.normalization,
                  cumulativePrior: draft.cumulativePrior,
                },
                null,
                2,
              )}
            </pre>
          </details>
          <button>새 기준 저장 및 전체 재계산</button>
        </form>
      )}
      {notice && (
        <div className="notice amber" role="status">
          {notice}
        </div>
      )}
      {error !== undefined && <ErrorBox error={error} />}
      <h3 className="section-title">불변 평가 버전 이력</h3>
      {r.data?.map((rule) => (
        <details className="rule-note" key={rule.id}>
          <summary>{rule.id}</summary>
          <pre>{JSON.stringify(rule, null, 2)}</pre>
        </details>
      ))}
    </>
  );
}
