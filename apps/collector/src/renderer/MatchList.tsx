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
          {filter && filter !== "전체"
            ? `${filter} 경기가 없습니다.`
            : "아직 조회한 경기가 없습니다. 롤에서 경기 가져오기 버튼으로 시작하세요."}
        </div>
      )}
    </section>
  );
}
