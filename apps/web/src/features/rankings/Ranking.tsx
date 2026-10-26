import { useRemote } from "../../api";
import type { Rankings } from "../../types";
import {
  Heading,
  Loading,
  ErrorBox,
  Empty,
  Status,
  score,
  Kda,
  RuleNote,
} from "../../components/Common";
export function Ranking() {
  const r = useRemote<Rankings>("/api/rankings");
  return (
    <>
      <Heading eyebrow="PERFORMANCE BOARD" title="활약 랭킹">
        <span className="badge cyan">3경기부터 정식 랭킹</span>
      </Heading>
      <p className="lead">
        같은 역할의 기여를 비교하고, 기록이 적을수록 모임 평균을 반영합니다.
      </p>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox error={r.error} retry={r.reload} />
      ) : !r.data?.members.length ? (
        <Empty />
      ) : (
        <>
          <div className="panel table-scroll">
            <table className="rankings">
              <thead>
                <tr>
                  {[
                    "순위",
                    "참가자",
                    "경기",
                    "승패",
                    "승률",
                    "누적 KDA",
                    "활약 점수",
                    "상태",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.data.members.map(({ displayName, stats: s }) => (
                  <tr key={s.memberId}>
                    <td>
                      <span className={s.rank === 1 ? "rank top-rank" : "rank"}>
                        {s.rank ?? "—"}
                      </span>
                    </td>
                    <td>
                      <a
                        className="player-name"
                        href={"/members/" + s.memberId}
                      >
                        {displayName}
                      </a>
                    </td>
                    <td>{s.games}</td>
                    <td>
                      {s.wins}승 {s.losses}패
                    </td>
                    <td>{s.winRate.toFixed(1)}%</td>
                    <td>
                      <Kda stats={s} />
                    </td>
                    <td className="score">{score(s.adjustedScore)}</td>
                    <td>
                      <Status status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <RuleNote version={r.data.scoringVersion} />
        </>
      )}
    </>
  );
}
