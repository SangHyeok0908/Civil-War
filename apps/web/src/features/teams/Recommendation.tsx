import { useState } from "react";
import { api, useRemote } from "../../api";
import type { PublicMember, Recommendation as Result } from "../../types";
import {
  Heading,
  Loading,
  ErrorBox,
  Empty,
  roleName,
  score,
} from "../../components/Common";
export function Recommendation() {
  const members = useRemote<PublicMember[]>("/api/members");
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  async function recommend() {
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    try {
      setResult(
        await api<Result>("/api/teams/recommend", "POST", {
          memberIds: selected,
        }),
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading eyebrow="TEAM BUILDER" title="균형 있는 팀 추천">
        <span className="selection-count">
          {selected.length}
          <small> / 10명 선택</small>
        </span>
      </Heading>
      <p className="lead">
        가능한 포지션을 지키며 실력 균형을 먼저, 주·부 포지션을 그다음으로
        고려합니다.
      </p>
      {members.loading ? (
        <Loading />
      ) : members.error ? (
        <ErrorBox error={members.error} retry={members.reload} />
      ) : (
        <div className="selection-grid">
          {members.data
            ?.filter((m) => m.active)
            .map((m) => (
              <label
                className={
                  "selection-card " +
                  (selected.includes(m.id) ? "selected" : "")
                }
                key={m.id}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(m.id)}
                  disabled={
                    busy || (selected.length === 10 && !selected.includes(m.id))
                  }
                  onChange={(e) => {
                    setSelected(
                      e.target.checked
                        ? [...selected, m.id]
                        : selected.filter((id) => id !== m.id),
                    );
                    setResult(undefined);
                  }}
                />
                <span>
                  <strong>{m.displayName}</strong>
                  <small>
                    {m.allowedRoles.length
                      ? m.allowedRoles.map((r) => roleName[r]).join(" · ")
                      : "가능한 포지션 미지정"}
                  </small>
                </span>
              </label>
            ))}
        </div>
      )}
      <div className="action-row">
        <button disabled={selected.length !== 10 || busy} onClick={recommend}>
          {busy ? "팀을 계산하는 중…" : "팀 추천 받기"}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setSelected([]);
            setResult(undefined);
          }}
        >
          선택 초기화
        </button>
      </div>
      {error !== undefined && <ErrorBox error={error} retry={recommend} />}{" "}
      {result && (
        <section aria-live="polite">
          <h2 className="section-title">
            추천 결과{" "}
            <span className="subtle">{result.candidates.length}개</span>
          </h2>
          {result.reason && <Empty>{result.reason}</Empty>}
          <div className="candidate-grid">
            {result.candidates.map((c, i) => (
              <article className="panel candidate" key={i}>
                <div className="panel-heading">
                  <h3>후보 {i + 1}</h3>
                  <span className="badge cyan">
                    팀 합 차이 {score(c.skillDifference)}
                  </span>
                </div>
                <div className="two-columns">
                  {[c.teamA, c.teamB].map((team, t) => (
                    <div key={t}>
                      <h4>{t === 0 ? "A팀" : "B팀"}</h4>
                      {team.map((s) => (
                        <div className="team-seat" key={s.memberId}>
                          <span className="role">{roleName[s.role]}</span>
                          <a href={"/members/" + s.memberId}>
                            {
                              members.data?.find((m) => m.id === s.memberId)
                                ?.displayName
                            }
                          </a>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <p className="caption">
            서로 다른 선수 구성만 표시합니다. 가장 균형 잡힌 구성의 팀 합 차이
            +5 이내에서 최대 3개를 제공합니다. 실제 경기 포지션은 등록 때 별도로
            확인합니다.
          </p>
        </section>
      )}
    </>
  );
}
