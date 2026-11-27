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
  WeightsTable,
} from "../../components/Common";
const sum = (weights: Record<string, number>) =>
  Object.values(weights).reduce((a, b) => a + b, 0);
// Weights step by 0.1, so anything closer than that to 100 is a rounding artefact.
const isHundred = (total: number) => Math.abs(total - 100) < 0.05;
function suggestId(existing: Rules[]) {
  const today = new Date()
    .toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
    .replaceAll("-", "");
  const used = new Set(existing.map((rule) => rule.id));
  let id = "v" + today;
  for (let n = 2; used.has(id); n++) id = `v${today}-${n}`;
  return id;
}
export function Scoring() {
  const r = useRemote<Rules[]>("/api/admin/scoring-versions");
  const [draft, setDraft] = useState<Rules>();
  const [id, setId] = useState("");
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!r.data?.length) return;
    setDraft(structuredClone(r.data.at(-1)));
    setId(suggestId(r.data));
  }, [r.data]);
  const problems = draft
    ? roles.flatMap((role) => {
        const weights = draft.weightsByRole[role];
        const total = sum(weights);
        return [
          ...(isHundred(total)
            ? []
            : [
                `${roleName[role]}의 합계가 ${total.toFixed(1)}입니다. 100이 되도록 맞춰 주세요.`,
              ]),
          ...(weights.win > 5
            ? [`${roleName[role]}의 승패 가중치는 5 이하여야 합니다.`]
            : []),
          ...(Object.values(weights).some((value) => value < 0)
            ? [`${roleName[role]}에 0보다 작은 가중치가 있습니다.`]
            : []),
        ];
      })
    : [];
  return (
    <>
      <h2>평가 기준 새 버전</h2>
      <p className="lead">
        포지션마다 어떤 항목을 얼마나 중요하게 볼지 정합니다. 포지션별 합계는
        100, 승패 가중치는 최대 5입니다. 저장하면 지금까지의 모든 경기를 새
        기준으로 다시 계산합니다.
      </p>
      <ObjectiveRuleNote />
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox error={r.error} retry={r.reload} />
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
            setNotice("");
            setBusy(true);
            try {
              await api("/api/admin/scoring-versions", "POST", {
                ...draft,
                id,
              });
              setNotice(
                "새 평가 기준을 저장했습니다. 전체 기록을 다시 계산합니다.",
              );
              r.reload();
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
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
                {roles.map((role) => {
                  const total = sum(draft.weightsByRole[role]);
                  return (
                    <tr
                      key={role}
                      className={isHundred(total) ? undefined : "invalid"}
                    >
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
                      <td className="weights-total">
                        {total.toFixed(1)}
                        {!isHundred(total) && (
                          <small>
                            {total > 100
                              ? `${(total - 100).toFixed(1)} 초과`
                              : `${(100 - total).toFixed(1)} 부족`}
                          </small>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {problems.length > 0 && (
            <div className="notice amber" role="status">
              {problems.map((problem) => (
                <p key={problem}>{problem}</p>
              ))}
            </div>
          )}
          <div>
            <label>
              새 버전 이름
              <input
                required
                pattern="[A-Za-z0-9_-]{1,100}"
                aria-describedby="version-name-hint"
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            </label>
            <small id="version-name-hint">
              제안된 이름을 그대로 써도 됩니다. 바꾸려면 영문, 숫자, 하이픈(-),
              밑줄(_)만 사용해 주세요.
            </small>
          </div>
          <button disabled={busy || problems.length > 0}>
            {busy ? "저장 중…" : "새 기준 저장 및 전체 재계산"}
          </button>
        </form>
      )}
      {notice && (
        <div className="notice amber" role="status">
          {notice}
        </div>
      )}
      {error !== undefined && (
        <ErrorBox
          error={error}
          messages={{
            CONFLICT:
              "같은 이름의 버전이 이미 있습니다. 새 버전 이름을 바꿔 주세요.",
          }}
        />
      )}
      <h3 className="section-title">평가 기준 버전 기록</h3>
      <p className="caption">
        저장한 버전은 고칠 수 없으며, 바꾸려면 새 버전을 만듭니다. 가장 아래가
        가장 최근에 만든 버전입니다.
      </p>
      {r.data?.map((rule, index) => (
        <details className="rule-note" key={rule.id}>
          <summary>
            {rule.id}
            {index === r.data!.length - 1 && (
              <span className="badge cyan">최신</span>
            )}
          </summary>
          <WeightsTable ruleset={rule} caption="포지션별 가중치 (%)" />
        </details>
      ))}
    </>
  );
}
