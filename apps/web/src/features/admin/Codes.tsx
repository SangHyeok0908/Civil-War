import { useState } from "react";
import { api, useRemote } from "../../api";
import type { AdminMember } from "../../types";
import { Loading, ErrorBox, kst, Empty } from "../../components/Common";
type Entry = {
  id: string;
  scope?: string;
  memberId?: string;
  expiresAt?: string;
  createdAt?: string;
  lastSeenAt?: string;
  revoked: boolean;
  consumed?: boolean;
};
export function Codes() {
  const members = useRemote<AdminMember[]>("/api/admin/members");
  const group = useRemote<{
    active: boolean;
    generation: number;
    issuedAt?: string;
  }>("/api/admin/collector-code");
  const [issued, setIssued] = useState<{ code: string; expiresAt?: string }>();
  const [error, setError] = useState<unknown>();
  const [refresh, setRefresh] = useState(0);
  async function change(path: string, method = "POST", body?: unknown) {
    setError(undefined);
    setIssued(undefined);
    try {
      const reply = await api<{ code: string; expiresAt?: string }>(
        path,
        method,
        body,
      );
      if (reply?.code) setIssued(reply);
      group.reload();
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e);
    }
  }
  return (
    <>
      <h2>모임 코드와 연결 관리</h2>
      <section className="panel form-stack">
        <h3>수집기 모임 코드</h3>
        <p>
          등록된 참가자라면 같은 6자리 숫자 코드로 여러 수집기를 연결할 수
          있습니다. 재발급하거나 삭제하면 모든 수집기가 해제되어 새 코드를
          입력해야 합니다. 저장된 경기와 PC의 전송 대기 자료는 유지됩니다.
        </p>
        {group.loading ? (
          <Loading />
        ) : group.error ? (
          <ErrorBox error={group.error} />
        ) : (
          <>
            <p>{group.data?.active ? "사용 중" : "발급된 코드 없음"}</p>
            {group.data?.active ? (
              <>
                <button
                  onClick={() => change("/api/admin/collector-code/rotate")}
                >
                  모임 코드 재발급
                </button>
                <button
                  className="danger secondary"
                  onClick={() => change("/api/admin/collector-code", "DELETE")}
                >
                  모임 코드 삭제
                </button>
              </>
            ) : (
              <button onClick={() => change("/api/admin/collector-code")}>
                모임 코드 발급
              </button>
            )}
          </>
        )}
      </section>
      {issued && (
        <div className="notice amber">
          <strong>지금 한 번만 표시되는 코드</strong>
          <output className="issued-code">{issued.code}</output>
          {issued.expiresAt && <small>만료: {kst(issued.expiresAt)}</small>}
          <button className="secondary" onClick={() => setIssued(undefined)}>
            코드 숨기기
          </button>
        </div>
      )}
      {error !== undefined && <ErrorBox error={error} />}
      <div key={refresh}>
        <CredentialTable title="운영자 브라우저 인증" kind="sessions" />
        <CredentialTable
          title="수집자 기기 인증"
          kind="collector-credentials"
          members={members.data}
        />
      </div>
    </>
  );
}
function CredentialTable({
  title,
  kind,
  members,
}: {
  title: string;
  kind: string;
  members?: AdminMember[];
}) {
  const r = useRemote<Entry[]>("/api/admin/" + kind);
  const [error, setError] = useState<unknown>();
  return (
    <section className="panel credentials">
      <h2 className="panel-heading">{title}</h2>
      {error !== undefined && <ErrorBox error={error} />}{" "}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox error={r.error} retry={r.reload} />
      ) : !r.data?.length ? (
        <Empty />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>식별자</th>
                <th>대상</th>
                <th>생성 / 만료</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {r.data.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{e.id.slice(0, 12)}</td>
                  <td>
                    {members?.find((m) => m.id === e.memberId)?.displayName ||
                      e.scope ||
                      "운영자"}
                  </td>
                  <td>
                    {e.expiresAt
                      ? kst(e.expiresAt)
                      : e.createdAt
                        ? kst(e.createdAt)
                        : "—"}
                  </td>
                  <td>
                    {e.revoked
                      ? "폐기됨"
                      : e.consumed
                        ? "사용됨"
                        : e.expiresAt && Date.parse(e.expiresAt) < Date.now()
                          ? "만료됨"
                          : "활성"}
                  </td>
                  <td>
                    <button
                      className="danger secondary"
                      disabled={e.revoked}
                      onClick={async () => {
                        try {
                          await api(
                            "/api/admin/" + kind + "/" + e.id,
                            "DELETE",
                          );
                          r.reload();
                        } catch (e) {
                          setError(e);
                        }
                      }}
                    >
                      폐기
                    </button>
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
