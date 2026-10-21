import { useState } from "react";
import { api, useRemote } from "../../api";
import type { AdminMember, Role, Suggestion } from "../../types";
import {
  roles,
  roleName,
  Loading,
  ErrorBox,
  Empty,
} from "../../components/Common";
const blank = {
  puuid: "",
  riotId: "",
  displayName: "",
  active: true,
  primaryRole: null as Role | null,
  secondaryRole: null as Role | null,
  allowedRoles: [] as Role[],
  seedSkill: 50,
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
        초기 실력은 팀 편성에만 반영됩니다. 현재 포지션을 바꾸어도 과거 경기의
        확정 역할은 유지됩니다.
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
            <div className="panel" key={m.id}>
              <div className="panel-heading">
                <div>
                  <h3>
                    {m.displayName}{" "}
                    <span className="badge">
                      {m.active ? "활성" : "비활성"}
                    </span>
                  </h3>
                  <small>
                    {m.riotId} · 초기 실력 {m.seedSkill} ·{" "}
                    {m.allowedRoles.map((r) => roleName[r]).join(" / ") ||
                      "포지션 미지정"}
                  </small>
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
  const [suggestion, setSuggestion] = useState<Suggestion>();
  const [official, setOfficial] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [samples, setSamples] = useState("");
  const [notice, setNotice] = useState("");
  const change = (k: string, v: unknown) => setForm({ ...form, [k]: v });
  async function suggest() {
    try {
      setSuggestion(
        await api<Suggestion>(
          "/api/admin/members/" + member!.id + "/role-suggestion",
        ),
      );
    } catch (e) {
      setError(e);
    }
  }
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
              displayName: form.displayName,
              riotId: form.riotId,
              active: form.active,
              primaryRole: form.primaryRole,
              secondaryRole: form.secondaryRole,
              allowedRoles: form.allowedRoles,
              seedSkill: form.seedSkill,
              ...(!member ? { puuid: form.puuid } : {}),
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
            공개 이름
            <input
              required
              value={form.displayName}
              onChange={(e) => change("displayName", e.target.value)}
            />
          </label>
          <label>
            Riot ID
            <input
              required
              value={form.riotId}
              onChange={(e) => change("riotId", e.target.value)}
            />
          </label>
          {!member && (
            <label>
              LCU PUUID
              <input
                required
                value={form.puuid}
                onChange={(e) => change("puuid", e.target.value)}
              />
            </label>
          )}
          <label>
            초기 실력 (0–100)
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={form.seedSkill}
              onChange={(e) => change("seedSkill", Number(e.target.value))}
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
            <label>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => change("active", e.target.checked)}
              />
              활성 참가자
            </label>
          </div>
        </fieldset>
        <div className="action-row">
          <button disabled={busy}>{busy ? "저장 중…" : "참가자 저장"}</button>
          <button type="button" className="secondary" onClick={done}>
            닫기
          </button>
        </div>
      </form>
      {member && (
        <details className="reference-editor">
          <summary>초기 포지션 참고 자료</summary>
          <p>
            공식 API PUUID와 LCU PUUID는 다를 수 있습니다. 연결을 직접 확인한
            자료만 가져오세요. 가져오기는 수동 설정이나 내전 점수를 변경하지
            않습니다.
          </p>
          <button className="secondary" onClick={suggest}>
            현재 참고 자료로 제안 보기
          </button>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(undefined);
              try {
                const parsed = JSON.parse(samples);
                setSuggestion(
                  await api<Suggestion>(
                    "/api/admin/member-references",
                    "POST",
                    {
                      memberId: member.id,
                      officialPuuid: official,
                      confirmedMapping: confirmed,
                      samples: Array.isArray(parsed) ? parsed : parsed.samples,
                    },
                  ),
                );
                setNotice(
                  "참고 자료를 가져왔습니다. 참가자 설정은 유지됩니다.",
                );
              } catch (e) {
                setError(e);
              }
            }}
          >
            <label>
              확인한 공식 API PUUID
              <input
                required
                value={official}
                onChange={(e) => setOfficial(e.target.value)}
              />
            </label>
            <label>
              참고 JSON 파일
              <input
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setSamples(await file.text());
                }}
              />
            </label>
            <label>
              참고 표본 JSON
              <textarea
                rows={5}
                required
                value={samples}
                onChange={(e) => setSamples(e.target.value)}
                placeholder="검증된 solo420 표본 배열"
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={confirmed}
                required
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              공식 계정과 이 참가자의 연결을 직접 확인했습니다
            </label>
            <button disabled={!confirmed || !samples}>
              참고 자료 가져오기
            </button>
          </form>
          {notice && (
            <p role="status" className="cyan-text">
              {notice}
            </p>
          )}
          {suggestion && (
            <div className="notice">
              <strong>
                최근 {suggestion.sampleCount}경기 제안:{" "}
                {suggestion.primary ? roleName[suggestion.primary] : "없음"} /{" "}
                {suggestion.secondary ? roleName[suggestion.secondary] : "없음"}
              </strong>
              <p>{suggestion.reason}</p>
              <small>
                {Object.entries(suggestion.sources)
                  .map(([k, n]) => k + " " + n + "경기")
                  .join(" · ")}
              </small>
              <button
                className="secondary"
                disabled={!suggestion.primary}
                onClick={() => {
                  setForm({
                    ...form,
                    primaryRole: suggestion.primary,
                    secondaryRole: suggestion.secondary,
                    allowedRoles: Array.from(
                      new Set([
                        ...form.allowedRoles,
                        ...[suggestion.primary, suggestion.secondary].filter(
                          (r): r is Role => r !== null,
                        ),
                      ]),
                    ),
                  });
                  setNotice(
                    "제안을 편집란에 적용했습니다. 참가자 저장을 눌러 확정하세요.",
                  );
                }}
              >
                제안을 편집란에 적용
              </button>
            </div>
          )}
          <p className="caption">
            수집기의 실시간 솔로 참고 내보내기는 아직 제공되지 않습니다. 검증된
            운영자 자료만 가져옵니다. 표본에는 queueId 420, durationSeconds
            ≥300, earlyEnded false가 필요합니다.
          </p>
        </details>
      )}
      {error !== undefined && <ErrorBox error={error} />}
    </div>
  );
}
