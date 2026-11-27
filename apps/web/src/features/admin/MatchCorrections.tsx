import { useEffect, useRef, useState } from "react";
import { Pagination } from "../../../../../packages/ui/Pagination";
import { api, useRemote } from "../../api";
import type {
  CollectorMatch,
  Participant,
} from "../../../../../packages/contracts/src";
import type { AdminMember, Role } from "../../types";
import {
  Loading,
  ErrorBox,
  Empty,
  roles,
  roleName,
  kst,
  Kda,
  number,
} from "../../components/Common";
import { ChampionItemIcon } from "../../components/ChampionItemIcon";
import { AuditTable, type AuditEntry } from "./Audit";
type Detail = {
  record: CollectorMatch;
  audit: AuditEntry[];
};
const pageSize = 10;
const teams = [100, 200] as const;
const teamName = { 100: "블루팀", 200: "레드팀" };
const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
const emptyText: Record<string, string> = {
  registered: "등록이 끝난 경기가 없습니다.",
  pending: "확인을 기다리는 경기가 없습니다.",
  canceled: "등록을 취소한 경기가 없습니다.",
};
export function MatchCorrections() {
  const [state, setState] = useState("registered");
  const r = useRemote<CollectorMatch[]>("/api/admin/matches?state=" + state);
  const members = useRemote<AdminMember[]>("/api/admin/members");
  const [key, setKey] = useState("");
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState("");
  const name = (puuid: string) =>
    members.data?.find((m) => m.puuid === puuid)?.displayName || "게스트";
  const all = r.data ?? [];
  const lastPage = Math.max(0, Math.ceil(all.length / pageSize) - 1);
  const current = Math.min(page, lastPage);
  const visible = all.slice(current * pageSize, (current + 1) * pageSize);
  const move = (next: number) => {
    setPage(next);
    setKey("");
    setNotice("");
  };
  return (
    <>
      <div className="section-heading">
        <h2>경기 정정·등록 취소</h2>
        <label>
          경기 상태
          <select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              move(0);
            }}
          >
            <option value="registered">등록 완료</option>
            <option value="pending">확인 대기</option>
            <option value="canceled">등록 취소</option>
          </select>
        </label>
      </div>
      <p className="caption">
        경기를 누르면 참가자의 포지션을 고치거나 등록을 취소할 수 있습니다.
        {all.length > 0 && ` 모두 ${all.length}경기입니다.`}
      </p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox error={r.error} retry={r.reload} />
      ) : !all.length ? (
        <Empty>{emptyText[state]}</Empty>
      ) : (
        <div className="match-list">
          {visible.map((m) => (
            <article
              className={
                "match-card correction-card" +
                (m.matchKey === key ? " selected" : "")
              }
              key={m.matchKey}
              data-match-key={m.matchKey}
            >
              <div className="correction-summary">
                <div className="match-meta">
                  <button
                    type="button"
                    className="match-link card-button"
                    aria-expanded={m.matchKey === key}
                    onClick={() => {
                      setNotice("");
                      setKey(m.matchKey === key ? "" : m.matchKey);
                    }}
                  >
                    {kst(m.match.startedAtUtc)}
                  </button>
                  <small>{duration(m.match.durationSeconds)}</small>
                  <span className="badge">
                    {m.matchKey === key ? "닫기" : "열기"}
                  </span>
                </div>
                <div className="roster-preview">
                  {teams.map((team) => {
                    const players = m.match.participants.filter(
                      (p) => p.teamId === team,
                    );
                    return (
                      <div key={team} className="preview-team">
                        <strong
                          className={players[0]?.win ? "victory" : "defeat"}
                        >
                          {players[0]?.win ? "승리" : "패배"}
                        </strong>
                        {players.map((p) => (
                          <span className="guest" key={p.puuid}>
                            <ChampionItemIcon id={p.championId} />
                            <small>{name(p.puuid)}</small>
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
              {m.matchKey === key && (
                <CorrectionEditor
                  key={key}
                  matchKey={key}
                  name={name}
                  members={members.data}
                  changed={(canceled) => {
                    // A canceled match leaves this list, so its message has to live here.
                    if (canceled) {
                      setKey("");
                      setNotice("등록을 취소했습니다.");
                    }
                    r.reload();
                  }}
                />
              )}
            </article>
          ))}
        </div>
      )}
      {all.length > pageSize && (
        <Pagination
          page={current + 1}
          canPrevious={current > 0}
          canNext={current < lastPage}
          previous={() => move(current - 1)}
          next={() => move(current + 1)}
        />
      )}
    </>
  );
}
function CorrectionEditor({
  matchKey,
  name,
  members,
  changed,
}: {
  matchKey: string;
  name: (puuid: string) => string;
  members?: AdminMember[];
  changed: (canceled: boolean) => void;
}) {
  const url = "/api/admin/matches/" + encodeURIComponent(matchKey);
  const r = useRemote<Detail>(url);
  const [draft, setDraft] = useState<Record<string, Role>>({});
  const [error, setError] = useState<unknown>();
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const result = useRef<HTMLParagraphElement>(null);
  // Saving disables the button that had focus, so focus moves on to the result.
  useEffect(() => {
    if (notice) result.current?.focus();
  }, [notice]);
  if (r.loading) return <Loading />;
  if (r.error) return <ErrorBox error={r.error} retry={r.reload} />;
  const record = r.data!.record;
  const editable = record.state === "registered";
  const roleOf = (p: Participant) =>
    draft[p.puuid] || record.confirmedRoles?.[p.puuid] || "";
  const players = (team: number) =>
    record.match.participants.filter((p) => p.teamId === team);
  const edited = record.match.participants.some(
    (p) =>
      draft[p.puuid] && draft[p.puuid] !== record.confirmedRoles?.[p.puuid],
  );
  // Each team needs the five positions exactly once, which the server also requires.
  const duplicated = (team: number) =>
    roles.filter(
      (role) => players(team).filter((p) => roleOf(p) === role).length > 1,
    );
  const problems = teams
    .filter((team) => duplicated(team).length)
    .map(
      (team) =>
        `${teamName[team]}에 ${duplicated(team)
          .map((role) => roleName[role])
          .join("·")} 포지션이 두 명 이상입니다.`,
    );
  async function run(kind: "save" | "cancel") {
    setBusy(kind);
    setError(undefined);
    setNotice("");
    try {
      if (kind === "save") {
        await api(url + "/roles", "PATCH", {
          rolesByPuuid: { ...record.confirmedRoles, ...draft },
        });
        setNotice("포지션을 정정했습니다. 평가를 다시 계산합니다.");
      } else {
        await api(url + "/cancel", "POST");
        changed(true);
        return;
      }
      r.reload();
      changed(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="correction-editor">
      <p className="caption">
        {editable
          ? "포지션만 고칠 수 있습니다. 킬·피해량 같은 경기 수치는 바꿀 수 없습니다. 팀마다 다섯 포지션을 한 명씩 지정해 주세요."
          : record.state === "pending"
            ? "수집기에서 포지션을 확인해 등록을 마친 뒤에 정정하거나 취소할 수 있습니다."
            : "등록을 취소한 경기입니다. 공개 전적과 점수에 포함되지 않으며 되돌릴 수 없습니다."}
      </p>
      {teams.map((team) => (
        <section className="correction-team" key={team}>
          <h3>
            <span className={players(team)[0]?.win ? "victory" : "defeat"}>
              {players(team)[0]?.win ? "승리" : "패배"}
            </span>
            <span className="subtle"> {teamName[team]}</span>
          </h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>참가자 / 챔피언</th>
                  <th>K / D / A</th>
                  <th>가한 피해</th>
                  <th>확정 포지션</th>
                </tr>
              </thead>
              <tbody>
                {players(team).map((p) => (
                  <tr key={p.puuid}>
                    <td>
                      <span className="player-name">{name(p.puuid)}</span>
                      <ChampionItemIcon id={p.championId} />
                    </td>
                    <td className="nowrap">
                      <Kda stats={p} />
                    </td>
                    <td>{number(p.championDamage)}</td>
                    <td>
                      <select
                        aria-label={name(p.puuid) + " 실제 포지션"}
                        disabled={!editable || !!busy}
                        value={roleOf(p)}
                        onChange={(e) => {
                          setNotice("");
                          setDraft({
                            ...draft,
                            [p.puuid]: e.target.value as Role,
                          });
                        }}
                      >
                        <option value="" disabled>
                          미확정
                        </option>
                        {roles.map((role) => (
                          <option key={role} value={role}>
                            {roleName[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {editable && (
        <>
          {problems.length > 0 && (
            <div className="notice amber" role="status">
              {problems.map((problem) => (
                <p key={problem}>{problem}</p>
              ))}
            </div>
          )}
          <div className="action-row">
            <button
              disabled={!edited || problems.length > 0 || !!busy}
              onClick={() => run("save")}
            >
              {busy === "save" ? "저장 중…" : "포지션 정정 저장"}
            </button>
            <button
              className="danger secondary"
              disabled={!!busy}
              onClick={() => setConfirm(true)}
            >
              등록 취소
            </button>
          </div>
          {confirm && (
            <div className="notice amber">
              <p>
                이 경기를 공개 전적과 모든 점수 계산에서 제외합니다. 취소한
                기록은 운영자 화면에만 남으며 되돌릴 수 없습니다.
              </p>
              <button
                className="danger"
                disabled={!!busy}
                onClick={() => run("cancel")}
              >
                {busy === "cancel" ? "취소하는 중…" : "등록 취소 확정"}
              </button>
              <button
                className="secondary"
                disabled={!!busy}
                onClick={() => setConfirm(false)}
              >
                돌아가기
              </button>
            </div>
          )}
        </>
      )}
      {notice && (
        <p className="notice" role="status" tabIndex={-1} ref={result}>
          {notice}
        </p>
      )}
      {error !== undefined && <ErrorBox error={error} />}
      <h3 className="section-title">이 경기의 변경 이력</h3>
      <AuditTable
        entries={r.data!.audit}
        names={{ members }}
        showTarget={false}
      />
      <small className="match-number">경기 번호 {matchKey}</small>
    </div>
  );
}
