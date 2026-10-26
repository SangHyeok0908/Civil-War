import type { MatchView } from "../preload/collector-api";
import type { Role } from "../../../../packages/contracts/src/index";
import { MatchReview } from "./MatchReview";
export function MatchList({
  matches,
  busy,
  save,
  confirm,
}: {
  matches: MatchView[];
  busy: boolean;
  save: (key: string, roles: Record<string, Role>) => void;
  confirm: (key: string, roles: Record<string, Role>) => void;
}) {
  return (
    <section aria-label="경기 목록">
      {matches.length ? (
        matches.map((m) => (
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
          아직 조회한 경기가 없습니다. 과거 경기 조회 버튼으로 시작하세요.
        </div>
      )}
    </section>
  );
}
