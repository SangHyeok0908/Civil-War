import { useState } from "react";
import { api, useRemote } from "../../api";
import type { AdminMember } from "../../types";
import { Loading, ErrorBox, kst, Empty } from "../../components/Common";
type Entry = {
  id: string;
  memberId?: string;
  createdAt?: string;
  lastSeenAt?: string;
  revoked: boolean;
};
type Pending = "rotate" | "delete" | null;
// The server signs a browser out after this long without use.
const sessionIdleDays = 7;
export function Codes({ sessionId }: { sessionId?: string }) {
  const members = useRemote<AdminMember[]>("/api/admin/members");
  const group = useRemote<{
    active: boolean;
    generation: number;
    issuedAt?: string;
  }>("/api/admin/collector-code");
  const [issued, setIssued] = useState<{ code: string; expiresAt?: string }>();
  const [error, setError] = useState<unknown>();
  const [refresh, setRefresh] = useState(0);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  async function change(path: string, method = "POST", body?: unknown) {
    setError(undefined);
    setIssued(undefined);
    setBusy(true);
    try {
      const reply = await api<{ code: string; expiresAt?: string }>(
        path,
        method,
        body,
      );
      if (reply?.code) setIssued(reply);
      setConfirm(null);
      group.reload();
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>모임 코드와 연결 관리</h2>
      <section className="panel editor form-stack">
        <h3>수집기 모임 코드</h3>
        <p>
          참가자가 수집기를 처음 연결할 때 입력하는 6자리 숫자 코드입니다.
          등록된 참가자라면 같은 코드로 여러 수집기를 연결할 수 있습니다.
        </p>
        {group.loading ? (
          <Loading />
        ) : group.error ? (
          <ErrorBox error={group.error} retry={group.reload} />
        ) : (
          <>
            <p>
              <strong>
                {group.data?.active ? "사용 중" : "발급된 코드 없음"}
              </strong>
              {group.data?.active && group.data.issuedAt && (
                <span className="subtle">
                  {" "}
                  · 발급 {kst(group.data.issuedAt)}
                </span>
              )}
            </p>
            {group.data?.active ? (
              <div className="action-row">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setConfirm("rotate")}
                >
                  모임 코드 재발급
                </button>
                <button
                  className="danger secondary"
                  disabled={busy}
                  onClick={() => setConfirm("delete")}
                >
                  모임 코드 삭제
                </button>
              </div>
            ) : (
              <div className="action-row">
                <button
                  disabled={busy}
                  onClick={() => change("/api/admin/collector-code")}
                >
                  {busy ? "발급하는 중…" : "모임 코드 발급"}
                </button>
              </div>
            )}
            {confirm && (
              <div className="notice amber">
                <p>
                  {confirm === "rotate"
                    ? "새 코드를 발급하면 지금 연결된 모든 수집기의 연결이 끊어집니다. 참가자 모두가 새 코드를 다시 입력해야 합니다."
                    : "코드를 삭제하면 지금 연결된 모든 수집기의 연결이 끊어지고, 새 코드를 발급하기 전까지 아무도 연결할 수 없습니다."}{" "}
                  이미 저장된 경기와 각 PC의 전송 대기 자료는 그대로 남습니다.
                </p>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() =>
                    confirm === "rotate"
                      ? change("/api/admin/collector-code/rotate")
                      : change("/api/admin/collector-code", "DELETE")
                  }
                >
                  {busy
                    ? "처리하는 중…"
                    : confirm === "rotate"
                      ? "재발급 확정"
                      : "삭제 확정"}
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                >
                  돌아가기
                </button>
              </div>
            )}
          </>
        )}
      </section>
      {issued && (
        <div className="notice amber">
          <strong>지금 한 번만 표시되는 코드</strong>
          <p>
            이 화면을 벗어나면 다시 볼 수 없습니다. 참가자에게 전달해 주세요.
          </p>
          <output className="issued-code">{issued.code}</output>
          {issued.expiresAt && <small>만료: {kst(issued.expiresAt)}</small>}
          <button className="secondary" onClick={() => setIssued(undefined)}>
            코드 숨기기
          </button>
        </div>
      )}
      {error !== undefined && <ErrorBox error={error} />}
      <div key={refresh}>
        <CredentialTable
          title="운영자 브라우저 인증"
          description={`운영자 코드로 로그인한 브라우저입니다. ${sessionIdleDays}일 동안 쓰지 않으면 자동으로 로그아웃됩니다.`}
          kind="sessions"
          sessionId={sessionId}
        />
        <CredentialTable
          title="수집자 기기 인증"
          description="모임 코드로 연결한 참가자의 수집기입니다. 폐기하면 그 수집기만 연결이 끊어집니다."
          kind="collector-credentials"
          members={members.data}
        />
      </div>
    </>
  );
}
function CredentialTable({
  title,
  description,
  kind,
  members,
  sessionId,
}: {
  title: string;
  description: string;
  kind: "sessions" | "collector-credentials";
  members?: AdminMember[];
  sessionId?: string;
}) {
  const r = useRemote<Entry[]>("/api/admin/" + kind);
  const [error, setError] = useState<unknown>();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const sessions = kind === "sessions";
  const expired = (e: Entry) =>
    sessions &&
    !!e.lastSeenAt &&
    Date.parse(e.lastSeenAt) + sessionIdleDays * 86400000 < Date.now();
  const usable = (e: Entry) => !e.revoked && !expired(e);
  // Newest first, and the browser in use stays on top so it is never revoked by mistake.
  const active = (r.data ?? [])
    .filter(usable)
    .sort(
      (a, b) =>
        Number(b.id === sessionId) - Number(a.id === sessionId) ||
        (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
  const ended = (r.data ?? []).filter((e) => !usable(e)).reverse();
  const who = (e: Entry) =>
    sessions
      ? e.id === sessionId
        ? "현재 브라우저"
        : "다른 브라우저"
      : (members?.find((m) => m.id === e.memberId)?.displayName ??
        "목록에 없는 참가자");
  async function revoke(e: Entry) {
    setBusy(true);
    setError(undefined);
    try {
      await api("/api/admin/" + kind + "/" + e.id, "DELETE");
      // Revoking this browser's own session signs the operator out.
      if (e.id === sessionId) window.location.assign("/admin");
      setConfirm("");
      r.reload();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  const head = (
    <thead>
      <tr>
        <th>{sessions ? "브라우저" : "참가자"}</th>
        <th>{sessions ? "로그인한 때" : "연결한 때"}</th>
        {sessions && <th>마지막 사용</th>}
        <th>상태</th>
        <th>관리</th>
      </tr>
    </thead>
  );
  const row = (e: Entry) => (
    <tr key={e.id} data-credential-id={e.id}>
      <td>
        {e.id === sessionId ? (
          <span className="badge cyan">{who(e)}</span>
        ) : (
          who(e)
        )}
      </td>
      <td className="nowrap">{e.createdAt ? kst(e.createdAt) : "—"}</td>
      {sessions && (
        <td className="nowrap">{e.lastSeenAt ? kst(e.lastSeenAt) : "—"}</td>
      )}
      <td>{e.revoked ? "폐기됨" : expired(e) ? "만료됨" : "활성"}</td>
      <td>
        {!usable(e) ? (
          <span className="subtle">—</span>
        ) : confirm === e.id ? (
          <div className="confirm-inline">
            <small>
              {e.id === sessionId
                ? "지금 쓰는 브라우저입니다. 폐기하면 바로 로그아웃됩니다."
                : sessions
                  ? "이 브라우저는 다시 로그인해야 합니다."
                  : "이 수집기는 모임 코드를 다시 입력해야 합니다."}
            </small>
            <button
              className="danger"
              disabled={busy}
              onClick={() => revoke(e)}
            >
              {busy ? "폐기하는 중…" : "폐기 확정"}
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setConfirm("")}
            >
              돌아가기
            </button>
          </div>
        ) : (
          <button className="danger secondary" onClick={() => setConfirm(e.id)}>
            폐기
          </button>
        )}
      </td>
    </tr>
  );
  return (
    <section className="panel credentials">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <small>{description}</small>
        </div>
      </div>
      {error !== undefined && <ErrorBox error={error} />}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox error={r.error} retry={r.reload} />
      ) : !active.length ? (
        <Empty>사용 중인 인증이 없습니다.</Empty>
      ) : (
        <div className="table-scroll">
          <table>
            {head}
            <tbody>{active.map(row)}</tbody>
          </table>
        </div>
      )}
      {ended.length > 0 && (
        <details className="ended-credentials">
          <summary>폐기되었거나 만료된 인증 {ended.length}개 보기</summary>
          <div className="table-scroll">
            <table>
              {head}
              <tbody>{ended.map(row)}</tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
