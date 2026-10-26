import { useState } from "react";
import { api, useRemote } from "../../api";
import type { CollectorMatch } from "../../../../../packages/contracts/src";
import type { AdminMember, Role } from "../../types";
import {
  Loading,
  ErrorBox,
  Empty,
  roles,
  roleName,
  kst,
  Kda,
} from "../../components/Common";
type AuditEntry = {
  id: string;
  action: string;
  targetId?: string;
  actorId: string;
  createdAt: string;
  details: unknown;
};
type Detail = {
  record: CollectorMatch;
  rawMatch: unknown;
  rawJson: string;
  audit: AuditEntry[];
};
export function MatchCorrections() {
  const [state, setState] = useState("registered");
  const r = useRemote<CollectorMatch[]>("/api/admin/matches?state=" + state);
  const [key, setKey] = useState("");
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
              setKey("");
            }}
          >
            <option value="registered">등록 완료</option>
            <option value="pending">확인 대기</option>
            <option value="canceled">등록 취소</option>
          </select>
        </label>
      </div>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox error={r.error} />
      ) : !r.data?.length ? (
        <Empty />
      ) : (
        <div className="correction-list">
          {r.data.map((m) => (
            <button
              className={"secondary " + (m.matchKey === key ? "active" : "")}
              key={m.matchKey}
              onClick={() => setKey(m.matchKey)}
            >
              {kst(m.match.startedAtUtc)} · {m.matchKey}
            </button>
          ))}
        </div>
      )}
      {key && <CorrectionEditor key={key} matchKey={key} changed={r.reload} />}
    </>
  );
}
function CorrectionEditor({
  matchKey,
  changed,
}: {
  matchKey: string;
  changed: () => void;
}) {
  const r = useRemote<Detail>(
    "/api/admin/matches/" + encodeURIComponent(matchKey),
  );
  const members = useRemote<AdminMember[]>("/api/admin/members");
  const [draft, setDraft] = useState<Record<string, Role>>({});
  const [error, setError] = useState<unknown>();
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  if (r.loading) return <Loading />;
  if (r.error) return <ErrorBox error={r.error} />;
  const record = r.data!.record;
  async function save() {
    try {
      await api(
        "/api/admin/matches/" + encodeURIComponent(matchKey) + "/roles",
        "PATCH",
        { rolesByPuuid: { ...record.confirmedRoles, ...draft } },
      );
      setNotice("포지션을 정정했습니다. 평가를 다시 계산합니다.");
      r.reload();
      changed();
    } catch (e) {
      setError(e);
    }
  }
  return (
    <div className="panel editor">
      <h3>{matchKey}</h3>
      <p className="caption">
        경기 수치는 읽기 전용입니다. 역할 정정은 팀마다 다섯 포지션을 하나씩
        지정해야 합니다.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>참가자</th>
              <th>팀</th>
              <th>K / D / A</th>
              <th>챔피언 피해량</th>
              <th>확정 포지션</th>
            </tr>
          </thead>
          <tbody>
            {record.match.participants.map((p) => (
              <tr key={p.puuid}>
                <td>
                  {members.data?.find((m) => m.puuid === p.puuid)
                    ?.displayName || "참가자"}
                </td>
                <td>{p.teamId}</td>
                <td>
                  <Kda stats={p} />
                </td>
                <td>{p.championDamage.toLocaleString()}</td>
                <td>
                  <select
                    aria-label={
                      (members.data?.find((m) => m.puuid === p.puuid)
                        ?.displayName || p.puuid) + " 실제 포지션"
                    }
                    disabled={record.state !== "registered"}
                    value={
                      draft[p.puuid] || record.confirmedRoles?.[p.puuid] || ""
                    }
                    onChange={(e) =>
                      setDraft({ ...draft, [p.puuid]: e.target.value as Role })
                    }
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
      {record.state === "registered" && (
        <div className="action-row">
          <button onClick={save}>포지션 정정 저장</button>
          <button className="danger secondary" onClick={() => setConfirm(true)}>
            등록 취소
          </button>
          {confirm && (
            <div className="notice amber">
              <p>
                공개 전적과 모든 집계에서 제외됩니다. 취소 자료는 운영자 기록에
                남으며 복원 기능은 없습니다.
              </p>
              <button
                className="danger"
                onClick={async () => {
                  try {
                    await api(
                      "/api/admin/matches/" +
                        encodeURIComponent(matchKey) +
                        "/cancel",
                      "POST",
                    );
                    setNotice("등록을 취소했습니다.");
                    setConfirm(false);
                    r.reload();
                    changed();
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                등록 취소 확정
              </button>
              <button className="secondary" onClick={() => setConfirm(false)}>
                돌아가기
              </button>
            </div>
          )}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {error !== undefined && <ErrorBox error={error} />}
      <h3>이 경기의 변경 이력</h3>
      <AuditTable entries={r.data!.audit} />
      <details>
        <summary>원본 수치 보기 (읽기 전용)</summary>
        <pre className="raw-record">{r.data!.rawJson}</pre>
      </details>
    </div>
  );
}
export function Audit() {
  const r = useRemote<AuditEntry[]>("/api/admin/audit");
  return (
    <>
      <h2>최근 변경 이력</h2>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox error={r.error} />
      ) : (
        <AuditTable entries={r.data || []} />
      )}
    </>
  );
}
function AuditTable({ entries }: { entries: AuditEntry[] }) {
  return !entries.length ? (
    <Empty />
  ) : (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>시간</th>
            <th>작업</th>
            <th>대상 / 상세</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((a) => (
            <tr key={a.id}>
              <td>{kst(a.createdAt)}</td>
              <td>{a.action}</td>
              <td>
                <span className="mono">{a.targetId}</span>
                <details>
                  <summary>변경 내용</summary>
                  <pre>
                    {typeof a.details === "string"
                      ? a.details
                      : JSON.stringify(a.details, null, 2)}
                  </pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
