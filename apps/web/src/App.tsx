import { useRemote } from "./api";
import type { Catalog } from "./types";
import { CatalogContext } from "./components/ChampionItemIcon";
import { MatchList } from "./features/matches/List";
import { MatchDetail } from "./features/matches/Detail";
import { Members, Profile } from "./features/members/Profile";
import { Ranking } from "./features/rankings/Ranking";
import { Recommendation } from "./features/teams/Recommendation";
import { Admin } from "./features/admin/Admin";
export function App() {
  const path = window.location.pathname;
  const catalog = useRemote<Catalog>("/api/assets");
  let content;
  if (path.startsWith("/admin")) content = <Admin path={path} />;
  else if (path.startsWith("/matches/"))
    content = <MatchDetail matchKey={decodeURIComponent(path.slice(9))} />;
  else if (path.startsWith("/members/"))
    content = <Profile id={decodeURIComponent(path.slice(9))} />;
  else if (path === "/members") content = <Members />;
  else if (path === "/rankings") content = <Ranking />;
  else if (path === "/teams") content = <Recommendation />;
  else content = <MatchList />;
  return (
    <CatalogContext.Provider value={catalog.data}>
      <a className="skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="/matches">
            <span className="brand-mark">CW</span>
            <span>
              CIVIL WAR<small>우리의 내전 기록</small>
            </span>
          </a>
          <nav aria-label="주 메뉴">
            {[
              ["/matches", "경기 기록"],
              ["/members", "참가자"],
              ["/rankings", "활약 랭킹"],
              ["/teams", "팀 추천"],
            ].map(([url, label]) => (
              <a
                key={url}
                href={url}
                aria-current={path.startsWith(url) ? "page" : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
          <a className="admin-link" href="/admin">
            운영자 ↗
          </a>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {content}
      </main>
      <footer>
        <span>
          CIVIL WAR <span className="subtle">· 함께한 경기의 기록</span>
        </span>
        <span>시간 표기 KST · 비공식 내전 평가</span>
      </footer>
    </CatalogContext.Provider>
  );
}
