import { useState, useContext, useRef } from "react";
import { Pagination } from "../../../../../packages/ui/Pagination";
import { useRemote } from "../../api";
import type { MatchPage, PublicMember } from "../../types";
import {
  Heading,
  Loading,
  ErrorBox,
  Empty,
  kst,
  shortPatch,
} from "../../components/Common";
import {
  ChampionItemIcon,
  CatalogContext,
} from "../../components/ChampionItemIcon";
export function MatchList({
  memberId,
  embedded = false,
}: {
  memberId?: string;
  embedded?: boolean;
}) {
  const catalog = useContext(CatalogContext);
  const start = useRef<HTMLElement>(null);
  const showStart = () => {
    start.current?.focus({ preventScroll: true });
    start.current?.scrollIntoView({ block: "start" });
  };
  const [championQuery, setChampionQuery] = useState("");
  const [filter, setFilter] = useState({
    memberId: memberId || "",
    championId: "",
  });
  const [cursor, setCursor] = useState("");
  const [previous, setPrevious] = useState<string[]>([]);
  const members = useRemote<PublicMember[]>("/api/members");
  const params = new URLSearchParams({ limit: "10" });
  Object.entries(filter).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  if (cursor) params.set("cursor", cursor);
  const result = useRemote<MatchPage>("/api/matches?" + params);
  // A full name wins; otherwise a part of a name counts once it points at one champion.
  // A bare number is still read as a champion ID so old links and tools keep working.
  const championId = (value: string) => {
    const query = value.trim();
    if (!query) return "";
    const champions = Object.entries(catalog?.champions || {});
    const exact = champions.find(([, asset]) => asset.name === query);
    if (exact) return exact[0];
    if (/^\d+$/.test(query)) return query;
    const partial = champions.filter(([, asset]) => asset.name.includes(query));
    return partial.length === 1 ? partial[0][0] : "";
  };
  const change = (key: string, value: string) => {
    setFilter({ ...filter, [key]: value });
    setCursor("");
    setPrevious([]);
  };
  return (
    <section
      ref={start}
      tabIndex={-1}
      aria-label={embedded ? "참가 경기" : "경기 기록"}
    >
      {!embedded && (
        <Heading eyebrow="MATCH HISTORY" title="경기 기록">
          <span className="subtle">확정된 내전만 공개됩니다</span>
        </Heading>
      )}
      <form className="filters" onSubmit={(e) => e.preventDefault()}>
        {!memberId && (
          <label>
            참가자
            <select
              value={filter.memberId}
              onChange={(e) => change("memberId", e.target.value)}
            >
              <option value="">전체 참가자</option>
              {members.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          챔피언
          <input
            list="champion-options"
            placeholder="챔피언 이름"
            value={championQuery}
            onChange={(e) => {
              const value = e.target.value;
              setChampionQuery(value);
              change("championId", championId(value));
            }}
          />
          <datalist id="champion-options">
            {Object.values(catalog?.champions || {})
              .sort((a, b) => a.name.localeCompare(b.name, "ko"))
              .map((c) => (
                <option value={c.name} key={c.name} />
              ))}
          </datalist>
        </label>
      </form>
      {!memberId && (
        <p className="caption">
          참가자와 챔피언을 함께 고르면 그 참가자가 그 챔피언으로 플레이한
          경기만 보여 줍니다.
        </p>
      )}
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorBox error={result.error} retry={result.reload} />
      ) : !result.data?.items.length ? (
        <Empty />
      ) : (
        <div className="match-list">
          {result.data.items.map((m) => (
            <article className="match-card" key={m.matchKey}>
              <div className="match-meta">
                <a
                  className="match-link"
                  href={"/matches/" + encodeURIComponent(m.matchKey)}
                >
                  {kst(m.startedAtUtc)}
                </a>
                <small>
                  {Math.floor(m.durationSeconds / 60)}분{" "}
                  {m.durationSeconds % 60}초 · 패치 {shortPatch(m.patch)}
                </small>
                {m.evaluationStatus !== "ready" && (
                  <span className="badge amber">점수 계산 중</span>
                )}
              </div>
              <div className="roster-preview">
                {[100, 200].map((team) => (
                  <div key={team} className="preview-team">
                    <strong
                      className={
                        m.participants.find((p) => p.teamId === team)?.win
                          ? "victory"
                          : "defeat"
                      }
                    >
                      {m.participants.find((p) => p.teamId === team)?.win
                        ? "승리"
                        : "패배"}
                    </strong>
                    {m.participants
                      .filter((p) => p.teamId === team)
                      .map((p) => (
                        <a
                          key={p.playerId}
                          href={
                            p.memberId ? "/members/" + p.memberId : undefined
                          }
                          title={p.displayName}
                        >
                          <ChampionItemIcon id={p.championId} />
                          <small>{p.displayName}</small>
                        </a>
                      ))}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      <Pagination
        page={previous.length + 1}
        canPrevious={previous.length > 0}
        canNext={!!result.data?.nextCursor}
        busy={result.loading}
        previous={() => {
          showStart();
          setCursor(previous.at(-1) || "");
          setPrevious(previous.slice(0, -1));
        }}
        next={() => {
          showStart();
          setPrevious([...previous, cursor]);
          setCursor(result.data?.nextCursor || "");
        }}
      />
    </section>
  );
}
