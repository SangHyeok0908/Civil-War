import { useRemote } from "../../api";
import type { Match, PublicParticipant } from "../../types";
import {
  Heading,
  Loading,
  ErrorBox,
  RuleNote,
  kst,
  Kda,
  number,
  roleName,
  score,
  metricName,
} from "../../components/Common";
import { ChampionItemIcon } from "../../components/ChampionItemIcon";
const isPending = (match: Match) => match.evaluationStatus !== "ready";
export function MatchDetail({ matchKey }: { matchKey: string }) {
  const result = useRemote<Match>(
    "/api/matches/" + encodeURIComponent(matchKey),
    isPending,
  );
  if (result.loading) return <Loading />;
  if (result.error)
    return <ErrorBox error={result.error} retry={result.reload} />;
  const m = result.data!;
  return (
    <>
      <Heading eyebrow="MATCH REPORT" title="경기 상세">
        <a href="/matches" className="secondary link-button">
          경기 목록
        </a>
      </Heading>
      <div className="meta-bar">
        <span>{kst(m.startedAtUtc)}</span>
        <span>
          {Math.floor(m.durationSeconds / 60)}분 {m.durationSeconds % 60}초
        </span>
        <span>패치 {m.patch}</span>
        <span className="mono">{m.matchKey}</span>
      </div>
      {m.evaluationStatus !== "ready" && (
        <div role="status" className="notice amber">
          계산 중 · 전적 수치는 확인할 수 있습니다.{" "}
          <button className="secondary" onClick={result.reload}>
            점수 새로고침
          </button>
        </div>
      )}
      {[100, 200].map((team) => {
        const ps = m.participants.filter((p) => p.teamId === team);
        const wins = ps[0]?.win;
        return (
          <section key={team} className="panel team-panel">
            <div className="panel-heading">
              <h2>
                <span className={wins ? "victory" : "defeat"}>
                  {wins ? "승리" : "패배"}
                </span>
                <span className="subtle">
                  {" "}
                  {team === 100 ? "블루팀" : "레드팀"}
                </span>
              </h2>
              <span>
                {ps.reduce((s, p) => s + p.kills, 0)} 킬 ·{" "}
                {number(ps.reduce((s, p) => s + p.goldEarned, 0))} 골드
              </span>
            </div>
            <div
              className="table-scroll"
              tabIndex={0}
              aria-label={`${team === 100 ? "블루" : "레드"}팀 전적 표 가로 스크롤`}
            >
              <table className="records">
                <thead>
                  <tr>
                    {[
                      "참가자 / 챔피언",
                      "포지션",
                      "K / D / A",
                      "가한 피해",
                      "받은 피해",
                      "CS",
                      "골드",
                      "시야",
                      "오브젝트 / 포탑",
                      "최종 아이템",
                      "활약",
                    ].map((x) => (
                      <th key={x} scope="col">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ps.map((p) => (
                    <PlayerRow key={p.memberId} p={p} m={m} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <RuleNote version={m.scoringVersion} />
      <p className="caption">
        점수·순위·누적 통계는 같은 평가 세대를 사용합니다. 원본 수치는 운영자도
        편집할 수 없습니다.
      </p>
    </>
  );
}
function PlayerRow({ p, m }: { p: PublicParticipant; m: Match }) {
  const s = m.scores.find((s) => s.memberId === p.memberId);
  return (
    <tr data-testid="player-row">
      <td>
        <a className="player-name" href={"/members/" + p.memberId}>
          {p.displayName}
        </a>
        <ChampionItemIcon id={p.championId} />
      </td>
      <td>
        <span className="role">{roleName[p.role]}</span>
      </td>
      <td className="nowrap">
        <Kda stats={p} />
      </td>
      <td>{number(p.championDamage)}</td>
      <td>{number(p.damageTaken)}</td>
      <td>{number(p.laneCs + p.neutralCs)}</td>
      <td>{number(p.goldEarned)}</td>
      <td>{number(p.visionScore)}</td>
      <td>
        {number(p.objectiveDamage)}
        <small>{number(p.turretDamage)}</small>
      </td>
      <td>
        <div className="items">
          {p.items.map((id, i) => (
            <ChampionItemIcon key={i + ":" + id} id={id} kind="item" />
          ))}
        </div>
      </td>
      <td>
        {s ? (
          <details>
            <summary>
              <strong className="score">{score(s.score)}</strong>
              <small>
                {m.scores.filter((x) => x.rank === s.rank).length > 1
                  ? "공동 "
                  : ""}
                {s.rank}위
              </small>
            </summary>
            <dl className="breakdown">
              {Object.entries(s.breakdown).map(([key, value]) => (
                <div key={key}>
                  <dt>{metricName[key]}</dt>
                  <dd>{score(value)}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : (
          <span className="subtle">계산 중</span>
        )}
      </td>
    </tr>
  );
}
