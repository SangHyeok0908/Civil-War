import { useState } from "react";
import { api, setCsrf } from "../../api";
import { Heading, ErrorBox } from "../../components/Common";
export function Login() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  return (
    <div className="login-wrap">
      <Heading eyebrow="OWNER ACCESS" title="운영자 로그인" />
      <p className="lead">운영자 로그인 코드를 입력하세요.</p>
      <form
        className="panel form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            const s = await api<{ csrfToken: string }>(
              "/api/admin/session",
              "POST",
              { code },
            );
            setCsrf(s.csrfToken);
            setCode("");
            window.location.assign("/admin/members");
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          운영자 로그인 코드
          <input
            type="password"
            minLength={8}
            maxLength={128}
            autoComplete="current-password"
            value={code}
            required
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <button disabled={busy || !code.trim()}>
          {busy ? "인증 중…" : "운영자 인증"}
        </button>
        <p className="caption">모임 코드는 운영자 권한을 부여하지 않습니다.</p>
      </form>
      {error !== undefined && <ErrorBox error={error} />}
    </div>
  );
}
