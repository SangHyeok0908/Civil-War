import { useEffect, useRef, useState } from "react";
import type { SafeAccount } from "../preload/collector-api";
import { message } from "./messages";
import { Modal } from "./Modal";
export function AccountView({
  account,
  busy,
  enroll,
  error,
}: {
  account: SafeAccount;
  busy: boolean;
  enroll: (code: string) => Promise<boolean>;
  error: string;
}) {
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);
  const prompted = useRef(false);
  const needsConnection =
    !account.enrolled ||
    ["AUTH_REVOKED", "REENROLL_REQUIRED", "PROTECTION_UNAVAILABLE"].includes(
      account.code ?? "",
    );
  useEffect(() => {
    if (!needsConnection) {
      prompted.current = false;
      setOpen(false);
    } else if (account.connected && !prompted.current) {
      prompted.current = true;
      setOpen(true);
    }
  }, [needsConnection, account.connected]);
  function dismiss() {
    if (!busy) {
      setOpen(false);
      setCode("");
    }
  }
  return (
    <section className="account">
      <div>
        <small>수집자 계정</small>
        <h2>{account.displayName ?? "롤 클라이언트 연결 대기"}</h2>
        {account.code && !needsConnection && (
          <p className="warning">{message(account.code)}</p>
        )}
        {account.code === "ACCOUNT_MISMATCH" && (
          <p>
            전송 대기 기록을 만든 계정으로 로그인해주세요.
            {account.expectedDisplayName
              ? ` (${account.expectedDisplayName})`
              : ""}
          </p>
        )}
        {needsConnection && !account.connected && (
          <p>롤 클라이언트를 실행하고 로그인하세요.</p>
        )}
      </div>
      {needsConnection && (
        <button
          className="secondary"
          onClick={() => setOpen(true)}
          disabled={busy}
        >
          모임 코드 입력
        </button>
      )}
      {open && needsConnection && (
        <Modal title="모임에 연결" dismiss={dismiss}>
          <p>
            {account.enrolled
              ? "모임 연결이 해제되었습니다. 새 모임 코드를 입력해주세요. 저장된 기록은 유지됩니다."
              : "운영자에게 받은 모임 코드를 입력해주세요."}
          </p>
          {!account.connected && (
            <p className="warning">롤 클라이언트를 실행하고 로그인하세요.</p>
          )}
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (await enroll(code)) {
                setOpen(false);
                setCode("");
              }
            }}
          >
            <label>
              모임 코드
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                autoComplete="off"
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="warning">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={dismiss}
                disabled={busy}
              >
                나중에
              </button>
              <button
                disabled={
                  busy || !account.connected || !/^[0-9]{6}$/.test(code)
                }
              >
                {busy ? "연결 중…" : "모임에 연결"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
