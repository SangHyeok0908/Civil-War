import { useEffect, useState } from "react";
import type { Snapshot } from "../preload/collector-api";
import { AccountView } from "./AccountView";
import { OutboxView } from "./OutboxView";
import { MatchList } from "./MatchList";
import { message } from "./messages";
export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      window.collector
        .snapshot()
        .then((s) => {
          if (alive) setSnapshot(s);
        })
        .catch(() => {
          if (alive) setNotice("수집기 연결을 확인하세요.");
        });
    void refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  async function run(fn: () => Promise<Snapshot>) {
    setBusy(true);
    setNotice("");
    try {
      setSnapshot(await fn());
    } catch (e) {
      setNotice(message(e instanceof Error ? e.message : "LOCAL_ERROR"));
    } finally {
      setBusy(false);
    }
  }
  if (!snapshot) return <main>수집기 시작 중…</main>;
  const a = snapshot.account;
  return (
    <main>
      <header className="title">
        <div>
          <small>CIVIL WAR · WINDOWS COLLECTOR</small>
          <h1>내전 수집기</h1>
          <p>조회한 경기를 확인하고 모임 내전으로 등록하세요.</p>
        </div>
        <span className="provisional">실기 검증 대기 · provisional</span>
      </header>
      <AccountView
        account={a}
        busy={busy}
        enroll={(code) => void run(() => window.collector.enroll(code))}
        resume={() => void run(() => window.collector.resumeOwnRequests())}
      />
      <div className="actions">
        <button
          disabled={
            busy || !a.connected || !a.enrolled || a.code === "ACCOUNT_MISMATCH"
          }
          onClick={() =>
            void run(async () => {
              const r = await window.collector.queryPastMatches();
              const failed = r.results.filter((x) => x.code);
              if (failed.length)
                setNotice(failed.map((x) => message(x.code!)).join(" / "));
              return r.snapshot;
            })
          }
        >
          {busy ? "처리 중…" : "과거 경기 조회"}
        </button>
        <button
          className="secondary"
          disabled={busy || !a.enrolled}
          onClick={() => void run(() => window.collector.loadPendingMatches())}
        >
          서버 확인 대기 불러오기
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            void window.collector
              .exportMemberReferences([])
              .then((r) => setNotice(r.reason))
              .catch(() => setNotice("참고 자료를 내보낼 수 없습니다."));
          }}
        >
          솔로랭크 참고 자료
        </button>
      </div>
      <p className="help">
        조회는 임시 저장만 합니다. ‘내전 등록’을 누른 경기만 공개 전적에
        반영됩니다.
      </p>
      {notice && (
        <p role="alert" className="warning">
          {notice}
        </p>
      )}
      {snapshot.serverError && snapshot.serverError !== a.code && (
        <p className="warning">{message(snapshot.serverError)}</p>
      )}
      <OutboxView matches={snapshot.matches} />
      <MatchList
        matches={snapshot.matches}
        busy={busy}
        save={(key, roles) => {
          void window.collector
            .saveDraft(key, roles)
            .then(setSnapshot)
            .catch((e) => setNotice(message(e.message)));
        }}
        confirm={(key, roles) =>
          void run(() => window.collector.confirmRegistration(key, roles, true))
        }
      />
    </main>
  );
}
