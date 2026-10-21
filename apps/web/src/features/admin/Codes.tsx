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
  const [scope, setScope] = useState("admin");
  const [memberId, setMemberId] = useState("");
  const [issued, setIssued] = useState<{ code: string; expiresAt: string }>();
  const [error, setError] = useState<unknown>();
  const [refresh, setRefresh] = useState(0);
  return (
    <>
      <h2>일회용 등록 코드</h2>
      <form
        className="panel form-grid editor"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(undefined);
          try {
            setIssued(
              await api("/api/admin/codes", "POST", {
                scope,
                ...(scope === "collector" ? { memberId } : {}),
              }),
            );
            setRefresh((n) => n + 1);
          } catch (e) {
            setError(e);
          }
        }}
      >
        <label>
          코드 종류
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="admin">새 운영자 브라우저</option>
            <option value="collector">수집자 기기</option>
          </select>
        </label>
        {scope === "collector" && (
          <label>
            연결할 참가자
            <select
              required
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              <option value="">참가자 선택</option>
              {members.data?.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>
        )}
        <button>코드 발급</button>
      </form>
      {issued && (
        <div className="notice amber">
          <strong>지금 한 번만 표시되는 코드</strong>
          <output className="issued-code">{issued.code}</output>
          <small>만료: {kst(issued.expiresAt)}</small>
          <button className="secondary" onClick={() => setIssued(undefined)}>
            코드 숨기기
          </button>
        </div>
      )}
      {error !== undefined && <ErrorBox error={error} />}
      <div key={refresh}>
        <CredentialTable
          title="발급 코드"
          kind="codes"
          members={members.data}
        />
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
