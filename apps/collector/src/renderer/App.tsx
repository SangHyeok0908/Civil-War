import { useEffect, useState, useRef } from "react";
import type { Snapshot } from "../preload/collector-api";
import { AccountView } from "./AccountView";
import { OutboxView } from "./OutboxView";
import { MatchList } from "./MatchList";
import { selectMatches, type MatchFilter } from "./match-filters";
import { message } from "./messages";
export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [filter, setFilter] = useState<MatchFilter>("전체");
  const [moved, setMoved] = useState("");
  const previous = useRef(new Map<string, string>());
  useEffect(() => {
    if (!snapshot) return;
    if (filter !== "전체") {
      const changed = snapshot.matches.find(
        (m) =>
          previous.current.get(m.matchKey) === filter && m.status !== filter,
      );
      if (changed) setMoved(`경기가 ${changed.status} 목록으로 이동했습니다.`);
    }
    previous.current = new Map(
      snapshot.matches.map((m) => [m.matchKey, m.status]),
    );
  }, [snapshot, filter]);
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
      return true;
    } catch (e) {
      setNotice(message(e instanceof Error ? e.message : "LOCAL_ERROR"));
      return false;
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
          <p>내전한 경기를 등록해주세요</p>
        </div>
        <span className="provisional">실기 검증 대기 · provisional</span>
      </header>
      <AccountView
        account={a}
        busy={busy}
        enroll={(code) => run(() => window.collector.enroll(code))}
        error={notice}
      />
      <div className="actions">
        <button
          disabled={
            busy ||
            !a.connected ||
            !a.enrolled ||
            [
              "ACCOUNT_MISMATCH",
              "AUTH_REVOKED",
              "COLLECTOR_UPDATE_REQUIRED",
            ].includes(a.code ?? "")
          }
          onClick={() =>
            void run(async () => {
              const r = await window.collector.queryPastMatches();
              const codes = [
                r.warningCode,
                ...r.results.map((x) => x.code),
              ].filter((code): code is string => !!code);
              setNotice([...new Set(codes)].map(message).join(" / "));
              return r.snapshot;
            })
          }
        >
          {busy ? "처리 중…" : "롤에서 경기 가져오기"}
        </button>
        <button
          className="secondary"
          disabled={busy || !a.enrolled}
          onClick={() => void run(() => window.collector.loadPendingMatches())}
        >
          확인할 경기 불러오기
        </button>
      </div>
      <p className="help">
        「롤에서 경기 가져오기」는 현재 PC의 롤 기록을 조회하고, 「확인할 경기
        불러오기」는 모임 서버에 저장된 경기를 확인합니다.
      </p>
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
      <OutboxView
        matches={snapshot.matches}
        selected={filter}
        onSelect={(value) => {
          setFilter(value);
          setMoved("");
        }}
      />
      {moved && <p role="status">{moved}</p>}
      <MatchList
        key={filter}
        matches={selectMatches(snapshot.matches, filter)}
        filter={filter}
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
