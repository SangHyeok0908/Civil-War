import { useState } from "react";
import { api, useRemote } from "../../api";
import { MemberAvatar } from "../../components/MemberAvatar";
import type { AdminMember, Role } from "../../types";
import {
  roles,
  roleName,
  Loading,
  ErrorBox,
  Empty,
  tierNames,
} from "../../components/Common";
function rankLabel(m: AdminMember) {
  if (m.rankTier)
    return `${tierNames[m.rankTier] ?? m.rankTier} ${m.rankDivision ?? ""}${m.rankStatus === "ranked" ? "" : " · 최근 조회값 사용"}`;
  if (m.rankStatus === "unranked") return "솔로랭크 등급 없음";
  if (m.rankStatus === "conflict" || m.rankStatus === "not_found")
    return "Riot ID와 계정 연결 확인 필요";
  return "팀 추천 때 조회합니다";
}
const blank = {
  riotId: "",
  active: true,
  primaryRole: null as Role | null,
  secondaryRole: null as Role | null,
  allowedRoles: [] as Role[],
};
export function MembersAdmin() {
  const result = useRemote<AdminMember[]>("/api/admin/members");
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section>
      <div className="section-heading">
        <h2>참가자와 가능한 포지션</h2>
        <button onClick={() => setEditing("new")}>참가자 추가</button>
      </div>
      <p className="caption">
        Riot ID로 참가자를 추가하고 게임 계정 정보를 자동으로 연결합니다. 현재
        포지션을 바꾸어도 과거 경기의 확정 역할은 유지됩니다.
      </p>
      {editing === "new" && (
        <MemberEditor
          done={() => {
            setEditing(null);
            result.reload();
          }}
        />
      )}
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorBox error={result.error} retry={result.reload} />
      ) : !result.data?.length ? (
        <Empty />
      ) : (
        <div className="admin-members">
          {result.data.map((m) => (
            <div
              className={
                "panel member-panel" + (editing === m.id ? " is-editing" : "")
              }
              key={m.id}
            >
              <div className="panel-heading">
                <div className="member-identity">
                  <MemberAvatar member={m} />
                  <div>
                    <h3>
                      {m.displayName}{" "}
                      <span className="badge">
                        {m.active ? "팀 추천 대상" : "팀 추천 제외"}
                      </span>
                    </h3>
                    <small>
                      {m.riotId} · {!m.puuid && "게임 계정 연결 확인 중 · "}{" "}
                      {m.allowedRoles.map((r) => roleName[r]).join(" / ") ||
                        "포지션 미지정"}
                    </small>
                    <small>{rankLabel(m)}</small>
                  </div>
                </div>
                <button
                  className="secondary"
                  onClick={() => setEditing(editing === m.id ? null : m.id)}
                >
                  편집
                </button>
              </div>
              {editing === m.id && (
                <MemberEditor
                  member={m}
                  done={() => {
                    setEditing(null);
                    result.reload();
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
function MemberEditor({
  member,
  done,
}: {
  member?: AdminMember;
  done: () => void;
}) {
  const [form, setForm] = useState(member ? { ...member } : { ...blank });
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const change = (k: string, v: unknown) => setForm({ ...form, [k]: v });
  return (
    <div className="editor">
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            const body = {
              riotId: form.riotId,
              active: form.active,
              primaryRole: form.primaryRole,
              secondaryRole: form.secondaryRole,
              allowedRoles: form.allowedRoles,
            };
            await api(
              "/api/admin/members" + (member ? "/" + member.id : ""),
              member ? "PATCH" : "POST",
              body,
            );
            done();
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label>
            Riot ID
            <input
              required
              value={form.riotId}
              onChange={(e) => change("riotId", e.target.value)}
            />
          </label>
          {(["primaryRole", "secondaryRole"] as const).map((k) => (
            <label key={k}>
              {k === "primaryRole" ? "주 포지션" : "부 포지션"}
              <select
                value={form[k] || ""}
                onChange={(e) => change(k, e.target.value || null)}
              >
                <option value="">미지정</option>
                {roles.map((r) => (
                  <option value={r} key={r}>
                    {roleName[r]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <fieldset>
          <legend>가능한 포지션</legend>
          <div className="checks">
            {roles.map((r) => (
              <label key={r}>
                <input
                  type="checkbox"
                  checked={form.allowedRoles.includes(r)}
                  onChange={(e) =>
                    change(
                      "allowedRoles",
                      e.target.checked
                        ? [...form.allowedRoles, r]
                        : form.allowedRoles.filter((x) => x !== r),
                    )
                  }
                />
                {roleName[r]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="check">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => change("active", e.target.checked)}
          />
          팀 추천 대상
        </label>
        <small>해제해도 과거 경기 기록은 유지됩니다.</small>
        <div className="action-row">
          <button disabled={busy}>{busy ? "저장 중…" : "참가자 저장"}</button>
          <button type="button" className="secondary" onClick={done}>
            닫기
          </button>
        </div>
      </form>
      {error !== undefined && <ErrorBox error={error} />}
    </div>
  );
}
