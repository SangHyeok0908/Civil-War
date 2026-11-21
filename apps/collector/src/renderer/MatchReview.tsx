import { useState } from "react";
import {
  ROLES,
  validateRoles,
  type Role,
} from "../../../../packages/contracts/src/index";
import type { MatchView } from "../preload/collector-api";
import { ChampionPortrait, getChampionLabel } from "./ChampionPortrait";
import { MatchProgress } from "./MatchProgress";
import { message } from "./messages";
import { Modal } from "./Modal";
const labels = {
  TOP: "탑",
  JUNGLE: "정글",
  MIDDLE: "미드",
  BOTTOM: "원딜",
  UTILITY: "서포터",
};
export function MatchReview({
  record,
  busy,
  save,
  confirm,
}: {
  record: MatchView;
  busy: boolean;
  save: (roles: Record<string, Role | null>) => void;
  confirm: (roles: Record<string, Role>) => void;
}) {
  const [edits, setEdits] = useState<Record<string, Role | null>>({});
  const [positionError, setPositionError] = useState("");
  const roles = { ...record.roles };
  if (record.state === "pending") {
    for (const [id, role] of Object.entries(edits)) {
      if (role === null) delete roles[id];
      else roles[id] = role;
    }
  }
  const editable =
    record.state === "pending" && record.category !== "registering";
  return (
    <article className="match">
      <header>
        <div>
          <h2>
            {new Date(record.match.startedAtUtc).toLocaleString("ko-KR")} ·{" "}
            {Math.floor(record.match.durationSeconds / 60)}분
          </h2>
        </div>
        <span
          className={"badge " + (record.state === "registered" ? "done" : "")}
        >
          {record.status}
        </span>
      </header>
      <MatchProgress record={record} />
      {record.error && <p className="warning">{message(record.error)}</p>}
      <div className="teams">
        {([100, 200] as const).map((team) => (
          <section
            key={team}
            tabIndex={0}
            role="region"
            aria-label={team === 100 ? "블루 팀 참가자" : "레드 팀 참가자"}
          >
            <h3>
              {team === 100 ? "블루 팀" : "레드 팀"} ·{" "}
              {record.match.participants.find((p) => p.teamId === team)?.win
                ? "승리"
                : "패배"}
            </h3>
            <table>
              <thead>
                <tr>
                  <th>참가자 / 챔피언</th>
                  <th>K/D/A</th>
                  <th>실제 포지션</th>
                </tr>
              </thead>
              <tbody>
                {record.match.participants
                  .filter((p) => p.teamId === team)
                  .map((p) => (
                    <tr key={p.puuid}>
                      <td>
                        <span className="participant-identity">
                          <ChampionPortrait championId={p.championId} />
                          <span>
                            <span className="participant-name">
                              {record.names[p.puuid]}
                            </span>
                            <small>{getChampionLabel(p.championId)}</small>
                          </span>
                        </span>
                      </td>
                      <td>
                        {p.kills}/{p.deaths}/{p.assists}
                      </td>
                      <td>
                        {editable ? (
                          <select
                            aria-label={record.names[p.puuid] + " 실제 포지션"}
                            value={roles[p.puuid] ?? ""}
                            onChange={(e) => {
                              const role = e.target.value
                                ? (e.target.value as Role)
                                : null;
                              setEdits((previous) => ({
                                ...previous,
                                [p.puuid]: role,
                              }));
                              save({ [p.puuid]: role });
                            }}
                            disabled={busy}
                          >
                            <option value="">직접 선택</option>
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {labels[r]}
                              </option>
                            ))}
                          </select>
                        ) : roles[p.puuid] ? (
                          labels[roles[p.puuid]]
                        ) : (
                          "미확정"
                        )}
                        {editable &&
                          record.roleSuggestions?.find(
                            (s) => s.puuid === p.puuid && s.role,
                          ) &&
                          !Object.prototype.hasOwnProperty.call(
                            { ...record.manualRoles, ...edits },
                            p.puuid,
                          ) && (
                            <small>경기 기록으로 추정 · 역할 확인 필요</small>
                          )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      {positionError && (
        <Modal
          title="실제 포지션을 확정해주세요"
          dismiss={() => setPositionError("")}
        >
          <p>{positionError}</p>
          <div className="modal-actions">
            <button onClick={() => setPositionError("")}>확인</button>
          </div>
        </Modal>
      )}
      {editable && (
        <footer>
          <button
            disabled={busy || record.category === "action_required"}
            onClick={() => {
              try {
                validateRoles(record.match, roles);
              } catch {
                const missing = record.match.participants.filter(
                  (p) => !roles[p.puuid],
                );
                setPositionError(
                  missing.length
                    ? `${missing.map((p) => record.names[p.puuid]).join(", ")} 참가자의 실제 포지션을 선택해주세요.`
                    : "같은 팀의 포지션이 중복되었습니다. 팀마다 탑·정글·미드·원딜·서포터를 한 명씩 지정해주세요.",
                );
                return;
              }
              confirm(roles);
            }}
          >
            내전 등록
          </button>
        </footer>
      )}
    </article>
  );
}
