export function Pagination({
  page,
  canPrevious,
  canNext,
  busy = false,
  previous,
  next,
}: {
  page: number;
  canPrevious: boolean;
  canNext: boolean;
  busy?: boolean;
  previous: () => void;
  next: () => void;
}) {
  return (
    <nav className="pagination" aria-label="경기 페이지">
      <button
        type="button"
        className="secondary"
        disabled={!canPrevious || busy}
        onClick={previous}
      >
        이전 페이지
      </button>
      <span aria-current="page" aria-live="polite">
        {page} 페이지
      </span>
      <button
        type="button"
        className="secondary"
        disabled={!canNext || busy}
        onClick={next}
      >
        다음 페이지
      </button>
    </nav>
  );
}
