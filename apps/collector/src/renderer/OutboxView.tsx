import type { MatchView } from "../preload/collector-api";
import { FILTERS, type MatchFilter } from "./match-filters";
export function OutboxView({
  matches,
  selected,
  onSelect,
}: {
  matches: MatchView[];
  selected: MatchFilter;
  onSelect: (filter: MatchFilter) => void;
}) {
  return (
    <nav className="queue-summary" aria-label="경기 상태별 보기">
      {FILTERS.map((s) => {
        const count =
          s === "전체"
            ? matches.length
            : matches.filter((m) => m.status === s).length;
        return (
          <button
            key={s}
            className={"secondary" + (count ? "" : " none")}
            aria-pressed={selected === s}
            onClick={() => onSelect(s)}
          >
            {s} <strong>{count}</strong>
          </button>
        );
      })}
    </nav>
  );
}
