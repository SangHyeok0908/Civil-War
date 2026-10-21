import type { MatchView } from "../preload/collector-api";
export function OutboxView({ matches }: { matches: MatchView[] }) {
  return (
    <aside className="queue-summary">
      {(
        [
          "전송 대기",
          "확인 대기",
          "등록 대기",
          "등록 완료",
          "등록 취소",
          "확인 필요",
        ] as const
      ).map((s) => (
        <span key={s}>
          {s} <strong>{matches.filter((m) => m.status === s).length}</strong>
        </span>
      ))}
    </aside>
  );
}
