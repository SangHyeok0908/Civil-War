import { useEffect, useState, useRef } from "react";
import type { QueryProgress, Snapshot } from "../preload/collector-api";
import { AccountView } from "./AccountView";
import { OutboxView } from "./OutboxView";
import { MatchList } from "./MatchList";
import { selectMatches, type MatchFilter } from "./match-filters";
import { message } from "./messages";
import { summarizeQuery, type QuerySummary } from "./query-summary";
type Action = "query" | "pending" | "enroll" | "confirm";
const BLOCKING = [
  "ACCOUNT_MISMATCH",
  "AUTH_REVOKED",
  "COLLECTOR_UPDATE_REQUIRED",
];
function describeProgress(progress: QueryProgress | null) {
  if (progress?.phase === "matches")
    return `${progress.total}경기 중 ${progress.current}번째 경기를 확인하고 있습니다.`;
  if (progress?.phase === "sending")
    return "가져온 경기를 서버에 보내고, 확인할 경기를 불러오고 있습니다.";
  return "롤 클라이언트에서 경기 목록을 읽고 있습니다.";
}
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
  const [busy, setBusy] = useState<Action | null>(null);
  const [progress, setProgress] = useState<QueryProgress | null>(null);
  const [result, setResult] = useState<QuerySummary | null>(null);
  // 알림은 출처별로 나눈다. 조회 결과가 연결 창에 나오거나 복구 뒤에도 남지 않게 한다.
  const [actionError, setActionError] = useState("");
  const [enrollError, setEnrollError] = useState("");
  const [unreachable, setUnreachable] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      window.collector
        .snapshot()
        .then((s) => {
          if (!alive) return;
          setSnapshot(s);
          setUnreachable(false);
        })
        .catch(() => {
          if (alive) setUnreachable(true);
        });
    void refresh();
    const timer = setInterval(refresh, 2000);
    const stop = window.collector.onQueryProgress((p) => {
      if (alive) setProgress(p);
    });
    return () => {
      alive = false;
      clearInterval(timer);
      stop();
    };
  }, []);
  async function run(action: Action, fn: () => Promise<Snapshot>) {
    const fail = action === "enroll" ? setEnrollError : setActionError;
    setBusy(action);
    setActionError("");
    setEnrollError("");
    try {
      setSnapshot(await fn());
      return true;
    } catch (e) {
      fail(message(e instanceof Error ? e.message : "LOCAL_ERROR"));
      return false;
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }
  if (!snapshot) return <main>수집기 시작 중…</main>;
  const a = snapshot.account;
  const blocked = BLOCKING.includes(a.code ?? "");
  // 버튼이 비활성화된 이유를 버튼 곁에서 알린다.
  const unavailable = !a.enrolled
    ? "모임 코드를 입력해 모임에 연결하면 경기를 가져올 수 있습니다."
    : blocked
      ? "위 수집자 계정 안내의 문제를 해결하면 경기를 가져올 수 있습니다."
      : !a.connected
        ? "롤 클라이언트에 로그인하면 새 경기를 가져올 수 있습니다. 이미 가져온 경기는 지금도 확인할 수 있습니다."
        : "";
  const reviewCount = snapshot.matches.filter(
    (m) => m.status === "확인 대기",
  ).length;
  const serverNotice =
    snapshot.serverError && snapshot.serverError !== a.code
      ? message(snapshot.serverError)
      : "";
  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <span className="brand-mark">CW</span>
          <strong>Civil War</strong>
          <span>수집기</span>
        </div>
      </header>
      <main id="collector-main">
        <header className="title">
          <div>
            <p className="eyebrow">우리의 내전 기록</p>
            <h1>내전 수집기</h1>
            <p>내전한 경기를 등록해주세요</p>
          </div>
        </header>
        <AccountView
          account={a}
          busy={!!busy}
          enroll={(code) => run("enroll", () => window.collector.enroll(code))}
          error={enrollError}
          clearError={() => setEnrollError("")}
        />
        <div className="actions">
          <button
            disabled={!!busy || !a.connected || !a.enrolled || blocked}
            aria-describedby={unavailable ? "fetch-unavailable" : undefined}
            onClick={() => {
              setResult(null);
              void run("query", async () => {
                const r = await window.collector.queryPastMatches();
                setResult(summarizeQuery(r.results, r.warningCode));
                return r.snapshot;
              });
            }}
          >
            {busy === "query" ? "가져오는 중…" : "롤에서 경기 가져오기"}
          </button>
          <button
            className="secondary"
            disabled={!!busy || !a.enrolled}
            onClick={() =>
              void run("pending", () => window.collector.loadPendingMatches())
            }
          >
            {busy === "pending" ? "불러오는 중…" : "확인할 경기 불러오기"}
          </button>
        </div>
        {unavailable && (
          <p className="help" id="fetch-unavailable">
            {unavailable}
          </p>
        )}
        {busy === "query" && (
          <p role="status" className="progress">
            {describeProgress(progress)}
          </p>
        )}
        <p className="help">
          가져온 경기는 임시 저장만 됩니다. ‘내전 등록’을 누른 경기만 공개
          전적에 반영됩니다.
        </p>
        <p className="help">
          「확인할 경기 불러오기」는 롤 클라이언트 없이 서버에 저장된 경기의
          최신 상태만 다시 확인합니다.
        </p>
        {unreachable && (
          <p className="warning">
            수집기 내부 연결을 확인하지 못했습니다. 계속되면 수집기를 다시
            실행하세요.
          </p>
        )}
        {actionError && (
          <p role="alert" className="warning">
            {actionError}
          </p>
        )}
        {serverNotice && serverNotice !== actionError && (
          <p className="warning">{serverNotice}</p>
        )}
        {result && (
          <QueryResult
            result={result}
            reviewCount={filter === "확인 대기" ? 0 : reviewCount}
            showReview={() => {
              setFilter("확인 대기");
              setMoved("");
            }}
            dismiss={() => setResult(null)}
          />
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
          busy={!!busy}
          save={(key, roles) => {
            void window.collector
              .saveDraft(key, roles)
              .then(setSnapshot)
              .catch((e) => setActionError(message(e.message)));
          }}
          confirm={(key, roles) =>
            void run("confirm", () =>
              window.collector.confirmRegistration(key, roles, true),
            )
          }
        />
      </main>
    </>
  );
}
function QueryResult({
  result,
  reviewCount,
  showReview,
  dismiss,
}: {
  result: QuerySummary;
  reviewCount: number;
  showReview: () => void;
  dismiss: () => void;
}) {
  return (
    <>
      <section
        className="query-result"
        role="status"
        aria-label="가져오기 결과"
      >
        <header>
          <strong>{result.headline}</strong>
          <button className="secondary" onClick={dismiss}>
            결과 닫기
          </button>
        </header>
        {result.problems.length > 0 && (
          <div className="query-problems">
            <h3>문제가 있어 가져오지 못한 경기</h3>
            <ul>
              {result.problems.map((r) => (
                <li key={r.code}>
                  <span>{r.text}</span>
                  <strong>{r.count}경기</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.excluded.length > 0 && (
          <div>
            <h3>내전이 아니어서 제외한 경기</h3>
            <ul>
              {result.excluded.map((r) => (
                <li key={r.code}>
                  <span>{r.text}</span>
                  <strong>{r.count}경기</strong>
                </li>
              ))}
            </ul>
            <small>제외한 경기는 따로 조치하지 않아도 됩니다.</small>
          </div>
        )}
        {reviewCount > 0 && (
          <footer>
            <button onClick={showReview}>
              확인 대기 {reviewCount}경기 보기
            </button>
          </footer>
        )}
      </section>
      {result.warning && (
        <p role="alert" className="warning">
          {result.warning}
        </p>
      )}
    </>
  );
}
