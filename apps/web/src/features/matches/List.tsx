import { useState, useContext } from "react";
import { useRemote } from "../../api";
import type { MatchPage, PublicMember } from "../../types";
import {
  Heading,
  Loading,
  ErrorBox,
  Empty,
  roles,
  roleName,
  kst,
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
  const [championQuery, setChampionQuery] = useState("");
  const [filter, setFilter] = useState({
    memberId: memberId || "",
    championId: "",
    role: "",
    win: "",
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
  const change = (key: string, value: string) => {
    setFilter({ ...filter, [key]: value });
    setCursor("");
    setPrevious([]);
  };
  return (
    <section>
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
            placeholder="챔피언 이름 또는 ID"
            value={championQuery}
            onChange={(e) => {
              const value = e.target.value;
              setChampionQuery(value);
              const id = Object.entries(catalog?.champions || {}).find(
                ([, asset]) => asset.name === value,
              )?.[0];
              change("championId", id || (/^\d+$/.test(value) ? value : ""));
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
        <label>
          포지션
          <select
            value={filter.role}
            onChange={(e) => change("role", e.target.value)}
          >
            <option value="">모든 포지션</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleName[r]}
              </option>
            ))}
          </select>
        </label>
        <label>
          승패
          <select
            value={filter.win}
            onChange={(e) => change("win", e.target.value)}
          >
            <option value="">모든 결과</option>
            <option value="true">승리</option>
            <option value="false">패배</option>
          </select>
        </label>
      </form>
      <p className="caption">
        선택한 조건은 같은 참가자의 기록에 함께 적용됩니다.
      </p>
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
                <span className="eyebrow">5 VS 5 · 소환사의 협곡</span>
                <a
                  className="match-link"
                  href={"/matches/" + encodeURIComponent(m.matchKey)}
                >
                  {kst(m.startedAtUtc)}
                </a>
                <small>
                  {Math.floor(m.durationSeconds / 60)}분{" "}
                  {m.durationSeconds % 60}초 · 패치 {m.patch}
                </small>
                <span className="badge">
                  {m.evaluationStatus === "ready" ? "평가 완료" : "계산 중"}
                </span>
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
                          key={p.memberId}
                          href={"/members/" + p.memberId}
                          title={p.displayName}
                        >
                          <ChampionItemIcon id={p.championId} />
                          <small>{p.displayName}</small>
                        </a>
                      ))}
                  </div>
                ))}
              </div>
              <a
                className="arrow-link"
                aria-label="경기 상세 보기"
                href={"/matches/" + encodeURIComponent(m.matchKey)}
              >
                상세 ↗
              </a>
            </article>
          ))}
        </div>
      )}
      <div className="pagination">
        <button
          className="secondary"
          disabled={!previous.length || result.loading}
          onClick={() => {
            setCursor(previous.at(-1) || "");
            setPrevious(previous.slice(0, -1));
          }}
        >
          이전 페이지
        </button>
        <span>{previous.length + 1} 페이지</span>
        <button
          className="secondary"
          disabled={!result.data?.nextCursor || result.loading}
          onClick={() => {
            setPrevious([...previous, cursor]);
            setCursor(result.data?.nextCursor || "");
          }}
        >
          다음 페이지
        </button>
      </div>
    </section>
  );
}
