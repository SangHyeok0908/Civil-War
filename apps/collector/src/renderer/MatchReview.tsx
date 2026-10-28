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
  const [checked, setChecked] = useState(false);
  const roles = { ...record.roles };
  if (record.state === "pending") {
    for (const [id, role] of Object.entries(edits)) {
      if (role === null) delete roles[id];
      else roles[id] = role;
    }
  }
  let valid = true;
  try {
    validateRoles(record.match, roles);
  } catch {
    valid = false;
  }
  const editable =
    record.state === "pending" && record.category !== "registering";
  return (
    <article className="match">
      <header>
        <div>
          <small>{record.matchKey}</small>
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
          <section key={team}>
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
      {editable && (
        <footer>
          <label>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />{" "}
            모임 내전이며 양 팀의 실제 포지션을 확인했습니다
          </label>
          <p>팀마다 다섯 포지션을 한 명씩 확인해야 등록할 수 있습니다.</p>
          <button
            disabled={
              busy ||
              !checked ||
              !valid ||
              record.category === "action_required"
            }
            onClick={() => confirm(roles)}
          >
            내전 등록
          </button>
        </footer>
      )}
    </article>
  );
}
