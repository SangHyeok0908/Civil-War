import { useEffect, useState } from "react";
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
  const count = Math.max(1, Math.ceil(matches.length / 3));
  const current = Math.min(page, count);
  useEffect(() => setPage((previous) => Math.min(previous, count)), [count]);
  const visible = matches.slice((current - 1) * 3, current * 3);
  return (
    <section aria-label="경기 목록">
      {count > 1 && (
        <nav aria-label="경기 페이지" className="pagination">
          {Array.from({ length: count }, (_, i) => i + 1).map((number) => (
            <button
              key={number}
              aria-label={`${number}페이지`}
              aria-current={current === number ? "page" : undefined}
              className="secondary"
              onClick={() => setPage(number)}
            >
              {number}
            </button>
          ))}
        </nav>
      )}
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
    </section>
  );
}
