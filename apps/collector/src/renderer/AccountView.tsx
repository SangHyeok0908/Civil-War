import { useState } from "react";
import type { SafeAccount } from "../preload/collector-api";
import { message } from "./messages";
export function AccountView({
  account,
  busy,
  enroll,
  resume,
}: {
  account: SafeAccount;
  busy: boolean;
  enroll: (code: string) => void;
  resume: () => void;
}) {
  const [code, setCode] = useState("");
  return (
    <section className="account">
      <div>
        <small>연결된 계정</small>
        <h2>{account.displayName ?? "롤 클라이언트 연결 대기"}</h2>
        <p>
          {["AUTH_REVOKED", "COLLECTOR_UPDATE_REQUIRED"].includes(
            account.code ?? "",
          )
            ? "모임에 다시 연결해야 합니다"
            : account.enrolled
              ? "모임에 연결됨"
              : "모임 코드 입력 필요"}
        </p>
        {account.code && <p className="warning">{message(account.code)}</p>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          enroll(code);
          setCode("");
        }}
      >
        <label>
          모임 코드
          <input
            type="password"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={100}
          />
        </label>
        <button disabled={busy || !code.trim() || !account.connected}>
          모임에 연결
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || !account.enrolled}
          onClick={resume}
        >
          멈춘 전송 이어 보내기
        </button>
      </form>
    </section>
  );
}
