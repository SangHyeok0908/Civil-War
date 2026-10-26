import { useRemote } from "../../api";
import type {
  Profile as ProfileData,
  PublicMember,
  RecordStats,
} from "../../types";
import {
  Heading,
  Loading,
  ErrorBox,
  Empty,
  Kda,
  Status,
  score,
  roleName,
  RuleNote,
} from "../../components/Common";
import { MatchList } from "../matches/List";
import { ChampionItemIcon } from "../../components/ChampionItemIcon";
export function Members() {
  const r = useRemote<PublicMember[]>("/api/members");
  return (
    <>
      <Heading eyebrow="OUR PLAYERS" title="참가자" />
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox error={r.error} retry={r.reload} />
      ) : !r.data?.length ? (
        <Empty />
      ) : (
        <div className="member-grid">
          {r.data.map((m) => (
            <a className="member-card" key={m.id} href={"/members/" + m.id}>
              <span className="avatar">{m.displayName.slice(0, 1)}</span>
              <div>
                <h2>{m.displayName}</h2>
                <p>
                  {m.primaryRole ? roleName[m.primaryRole] : "포지션 미지정"}
                  {m.secondaryRole ? " · " + roleName[m.secondaryRole] : ""}
                </p>
              </div>
              <span className={"badge " + (m.active ? "cyan" : "")}>
                {m.active ? "활성" : "비활성"}
              </span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
export function Profile({ id }: { id: string }) {
  const r = useRemote<ProfileData>("/api/members/" + id + "/stats");
  if (r.loading) return <Loading />;
  if (r.error)
    return (
      <>
        <ErrorBox error={r.error} retry={r.reload} />
        <h2>참가 경기</h2>
        <MatchList memberId={id} embedded />
      </>
    );
  const { member: m, stats: s } = r.data!;
  return (
    <>
      <Heading eyebrow="PLAYER PROFILE" title={m.displayName}>
        <Status status={s.status} />
      </Heading>
      <div className="stat-grid">
        <div>
          <span>참가 경기</span>
          <strong>
            {s.games}
            <small>
              {" "}
              {s.wins}승 {s.losses}패
            </small>
          </strong>
        </div>
        <div>
          <span>승률</span>
          <strong>
            {s.winRate.toFixed(1)}
            <small>%</small>
          </strong>
        </div>
        <div>
          <span>누적 K / D / A</span>
          <strong className="kda-summary">
            <Kda stats={s} />
          </strong>
        </div>
        <div>
          <span>보정 활약 점수</span>
          <strong className="cyan-text">
            {score(s.adjustedScore)}
            <small>{s.rank ? " · " + s.rank + "위" : ""}</small>
          </strong>
        </div>
      </div>
      <div className="two-columns">
        <StatsTable title="포지션별 기록" values={s.byRole} role />
        <StatsTable title="챔피언별 기록" values={s.byChampion} />
      </div>
      <RuleNote version={r.data?.scoringVersion} />
      <h2 className="section-title">참가 경기</h2>
      <MatchList memberId={id} embedded />
    </>
  );
}
function StatsTable({
  title,
  values,
  role = false,
}: {
  title: string;
  values: Record<string, RecordStats>;
  role?: boolean;
}) {
  return (
    <section className="panel">
      <h2 className="panel-heading">{title}</h2>
      {!Object.keys(values).length ? (
        <Empty />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{role ? "포지션" : "챔피언"}</th>
                <th>경기 / 승패</th>
                <th>합계 KDA</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(values).map(([key, s]) => (
                <tr key={key}>
                  <td>
                    {role ? (
                      roleName[key]
                    ) : (
                      <ChampionItemIcon id={Number(key)} />
                    )}
                  </td>
                  <td>
                    {s.games}경기{" "}
                    <small>
                      {s.wins}승 {s.losses}패
                    </small>
                  </td>
                  <td>
                    <Kda stats={s} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
