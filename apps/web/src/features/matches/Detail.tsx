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
  if (result.loading) {
    return <Loading />;
  }
  if (result.error) {
    return <ErrorBox error={result.error} retry={result.reload} />;
  }
  const match = result.data!;
  return (
    <>
      <Heading eyebrow="MATCH REPORT" title="경기 상세">
        <a href="/matches" className="secondary link-button">
          경기 목록
        </a>
      </Heading>
      <div className="meta-bar">
        <span>{kst(match.startedAtUtc)}</span>
        <span>
          {Math.floor(match.durationSeconds / 60)}분{" "}
          {match.durationSeconds % 60}초
        </span>
        <span>패치 {match.patch}</span>
        <span className="mono">{match.matchKey}</span>
      </div>
      {match.evaluationStatus !== "ready" && (
        <div role="status" className="notice amber">
          계산 중 · 전적 수치는 확인할 수 있습니다.{" "}
          <button className="secondary" onClick={result.reload}>
            점수 새로고침
          </button>
        </div>
      )}
      {([100, 200] as const).map((teamId) => (
        <TeamReport key={teamId} teamId={teamId} match={match} />
      ))}
      <RuleNote version={match.scoringVersion} />
      <p className="caption">
        점수·순위·누적 통계는 같은 평가 세대를 사용합니다. 원본 수치는 운영자도
        편집할 수 없습니다.
      </p>
    </>
  );
}

function TeamReport({ teamId, match }: { teamId: 100 | 200; match: Match }) {
  const participants = match.participants.filter(
    (participant) => participant.teamId === teamId,
  );
  const isWinner = participants[0]?.win;

  return (
    <section className="panel team-panel">
      <div className="panel-heading">
        <h2>
          <span className={isWinner ? "victory" : "defeat"}>
            {isWinner ? "승리" : "패배"}
          </span>
          <span className="subtle">
            {" "}
            {teamId === 100 ? "블루팀" : "레드팀"}
          </span>
        </h2>
        <span>
          {participants.reduce(
            (total, participant) => total + participant.kills,
            0,
          )}{" "}
          킬 ·{" "}
          {number(
            participants.reduce(
              (total, participant) => total + participant.goldEarned,
              0,
            ),
          )}{" "}
          골드
        </span>
      </div>
      <div
        className="table-scroll"
        tabIndex={0}
        aria-label={`${teamId === 100 ? "블루" : "레드"}팀 전적 표 가로 스크롤`}
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
              ].map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {participants.map((participant) => (
              <PlayerRow
                key={participant.memberId}
                participant={participant}
                match={match}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PlayerRow({
  participant,
  match,
}: {
  participant: PublicParticipant;
  match: Match;
}) {
  const playerScore = match.scores.find(
    (gameScore) => gameScore.memberId === participant.memberId,
  );
  return (
    <tr data-testid="player-row">
      <td>
        <a className="player-name" href={"/members/" + participant.memberId}>
          {participant.displayName}
        </a>
        <ChampionItemIcon id={participant.championId} />
      </td>
      <td>
        <span className="role">{roleName[participant.role]}</span>
      </td>
      <td className="nowrap">
        <Kda stats={participant} />
      </td>
      <td>{number(participant.championDamage)}</td>
      <td>{number(participant.damageTaken)}</td>
      <td>{number(participant.laneCs + participant.neutralCs)}</td>
      <td>{number(participant.goldEarned)}</td>
      <td>{number(participant.visionScore)}</td>
      <td>
        {number(participant.objectiveDamage)}
        <small>{number(participant.turretDamage)}</small>
      </td>
      <td>
        <div className="items">
          {participant.items.map((itemId, index) => (
            <ChampionItemIcon
              key={index + ":" + itemId}
              id={itemId}
              kind="item"
            />
          ))}
        </div>
      </td>
      <td>
        {playerScore ? (
          <details>
            <summary>
              <strong className="score">{score(playerScore.score)}</strong>
              <small>
                {match.scores.filter(
                  (gameScore) => gameScore.rank === playerScore.rank,
                ).length > 1
                  ? "공동 "
                  : ""}
                {playerScore.rank}위
              </small>
            </summary>
            <dl className="breakdown">
              {Object.entries(playerScore.breakdown).map(([key, value]) => (
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
