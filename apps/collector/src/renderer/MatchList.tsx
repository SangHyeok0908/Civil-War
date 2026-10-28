import { useEffect, useRef, useState } from "react";
import { Pagination } from "../../../../packages/ui/Pagination";
import type { MatchView } from "../preload/collector-api";
import type { Role } from "../../../../packages/contracts/src/index";
import { MatchReview } from "./MatchReview";
export function MatchList({
  matches,
  busy,
  filter,
  save,
  confirm,
}: {
  matches: MatchView[];
  busy: boolean;
  filter?: string;
  save: (key: string, roles: Record<string, Role | null>) => void;
  confirm: (key: string, roles: Record<string, Role>) => void;
}) {
  const [page, setPage] = useState(1);
  const start = useRef<HTMLElement>(null);
  const count = Math.max(1, Math.ceil(matches.length / 3));
  const current = Math.min(page, count);
  useEffect(() => setPage((previous) => Math.min(previous, count)), [count]);
  const visible = matches.slice((current - 1) * 3, current * 3);
  function goTo(number: number) {
    setPage(number);
    start.current?.focus({ preventScroll: true });
    start.current?.scrollIntoView({ block: "start" });
  }
  return (
    <section
      aria-label="경기 목록"
      ref={start}
      tabIndex={-1}
      className="match-list-region"
    >
      {matches.length ? (
        visible.map((m) => (
          <MatchReview
            key={m.matchKey}
            record={m}
            busy={busy}
            save={(roles) => save(m.matchKey, roles)}
            confirm={(roles) => confirm(m.matchKey, roles)}
          />
        ))
      ) : (
        <div className="empty">
          {filter && filter !== "전체"
            ? `${filter} 경기가 없습니다.`
            : "아직 조회한 경기가 없습니다. 롤에서 경기 가져오기 버튼으로 시작하세요."}
        </div>
      )}
      <Pagination
        page={current}
        canPrevious={current > 1}
        canNext={current < count}
        busy={busy}
        previous={() => goTo(current - 1)}
        next={() => goTo(current + 1)}
      />
    </section>
  );
}
