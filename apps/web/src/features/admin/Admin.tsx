import { api, setCsrf, useRemote } from "../../api";
import { Heading, Loading, ErrorBox } from "../../components/Common";
import { Login } from "./Login";
import { MembersAdmin } from "./Members";
import { Codes } from "./Codes";
import { MatchCorrections, Audit } from "./MatchCorrections";
import { Scoring } from "./Scoring";
import { Jobs } from "./Jobs";
export function Admin({ path }: { path: string }) {
  const session = useRemote<{ sessionId: string; csrfToken: string }>(
    "/api/admin/session",
  );
  if (session.loading) return <Loading />;
  if (session.error?.status === 401) return <Login />;
  if (session.error)
    return <ErrorBox error={session.error} retry={session.reload} />;
  if (session.data) setCsrf(session.data.csrfToken);
  const route = path.split("/")[2] || "members";
  return (
    <>
      <Heading eyebrow="OWNER WORKSPACE" title="운영 관리">
        <button
          className="secondary"
          onClick={async () => {
            try {
              await api("/api/admin/logout", "POST");
              setCsrf("");
              window.location.assign("/admin");
            } catch {
              session.reload();
            }
          }}
        >
          로그아웃
        </button>
      </Heading>
      <nav className="tabs" aria-label="운영자 메뉴">
        {[
          ["members", "참가자 관리"],
          ["codes", "코드·인증"],
          ["matches", "경기 정정"],
          ["scoring", "평가 기준"],
          ["jobs", "재계산 작업"],
          ["audit", "변경 이력"],
        ].map(([url, label]) => (
          <a
            key={url}
            href={"/admin/" + url}
            aria-current={route === url ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      {route === "codes" ? (
        <Codes />
      ) : route === "matches" ? (
        <MatchCorrections />
      ) : route === "scoring" ? (
        <Scoring />
      ) : route === "jobs" ? (
        <Jobs />
      ) : route === "audit" ? (
        <Audit />
      ) : (
        <MembersAdmin />
      )}
    </>
  );
}
