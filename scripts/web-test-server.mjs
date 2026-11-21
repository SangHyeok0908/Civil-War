// Isolated fixture harness only. Never points at a production database or exports a product endpoint.
import { spawn, execFileSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  createWriteStream,
  existsSync,
} from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
const root = process.cwd();
const origin = "http://localhost:18080";
const java = process.env.JAVA_HOME
  ? path.join(process.env.JAVA_HOME, "bin", "java")
  : "java";
const jar = path.join(
  root,
  "apps/server/build/libs/civil-war-server-0.1.0-provisional.jar",
);
const env = {
  ...process.env,
  DATABASE_URL: `jdbc:postgresql://localhost:${process.env.CW_TEST_DB_PORT || 55432}/cw_web_test`,
  DATABASE_USER: "cw_test",
  DATABASE_PASSWORD: "cw_test_only",
  SERVER_ORIGIN: origin,
  // Test-only operator code; production reads ADMIN_LOGIN_CODE from the server .env.
  ADMIN_LOGIN_CODE: "web-test-admin-code",
};
const args = [
  "-jar",
  jar,
  "--spring.profiles.active=dev",
  "--logging.level.root=WARN",
  "--cw.riot.poll-enabled=false",
];
mkdirSync("test-results", { recursive: true });
const docker =
  process.env.CW_DOCKER ||
  (existsSync("/usr/local/bin/docker") ? "/usr/local/bin/docker" : "docker");
const sql = (query, db = "cw_web_test") =>
  execFileSync(
    docker,
    [
      "compose",
      "-f",
      "infra/compose.test.yml",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "cw_test",
      "-d",
      db,
      "-v",
      "ON_ERROR_STOP=1",
      "-tAc",
      query,
    ],
    { encoding: "utf8" },
  ).trim();
if (!sql("select 1 from pg_database where datname='cw_web_test'", "postgres"))
  sql("CREATE DATABASE cw_web_test", "postgres");
execFileSync(java, [...args, "--spring.main.web-application-type=none"], {
  env,
  encoding: "utf8",
  timeout: 30000,
}); // Migrate only the dedicated fixture DB without a web listener or evaluation worker.
if (sql("select current_database()") !== "cw_web_test")
  throw Error("Unsafe fixture database");
sql(
  "TRUNCATE auth_attempts, solo_rank_snapshots, account_identity_evidence, player_accounts, role_reference_samples,member_reference_links,evaluation_generations,scoring_versions,audit_log,recalculation_jobs,match_participants,matches,collector_credentials,admin_sessions,enrollment_codes,members CASCADE; UPDATE service_state SET source_revision=0,desired_scoring_version=null,active_generation_id=null; UPDATE group_collector_code SET secret_hash=null,generation=1,issued_at=null",
);
const firstCode = env.ADMIN_LOGIN_CODE;
let child;
let log = createWriteStream("test-results/web-server.log", { flags: "a" });
async function waitFor(check) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      if (await check()) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Fixture server readiness timeout");
}
async function start() {
  child = spawn(java, [...args, "--server.port=18080"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  await waitFor(
    async () => (await fetch(origin + "/api/members")).status === 200,
  );
}
async function stop() {
  if (child && child.exitCode === null) {
    const current = child;
    const exited = new Promise((resolve) => current.once("exit", resolve));
    current.kill("SIGKILL");
    await exited;
  }
  child = undefined;
}
await start();
let cookie = "",
  csrf = "";
async function call(
  url,
  body,
  method = body === undefined ? "GET" : "POST",
  bearer,
) {
  const r = await fetch(origin + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CW-Collector-Protocol": "2",
      Origin: origin,
      ...(bearer
        ? { Authorization: "Bearer " + bearer }
        : cookie
          ? { Cookie: cookie, "X-CSRF-Token": csrf }
          : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok)
    throw Error("Fixture API " + url + " " + r.status + " " + (await r.text()));
  return { response: r, value: r.status === 204 ? null : await r.json() };
}
const login = await call("/api/admin/session", { code: firstCode });
cookie = login.response.headers.get("set-cookie").split(";")[0];
csrf = login.value.csrfToken;
const roles = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const names = [
  "여울",
  "바람",
  "루멘",
  "도담",
  "하루",
  "리브",
  "새벽",
  "온유",
  "모아",
  "유월",
  "다온",
];
let members = [];
for (let i = 0; i < 11; i++)
  members.push(
    (
      await call("/api/admin/members", {
        riotId: names[i] + "#TEST",
        primaryRole: roles[i % 5],
        secondaryRole: roles[(i + 1) % 5],
        allowedRoles: roles,
      })
    ).value,
  );
const collectorCode = (await call("/api/admin/collector-code", {})).value.code;
const credential = (
  await call("/api/collector/enroll", {
    code: collectorCode,
    protocolVersion: 2,
    currentAccount: {
      puuid: "fixture-player-01",
      riotId: members[0].riotId,
      source: "current_summoner",
      observedAt: new Date().toISOString(),
    },
  })
).value;
const { readFileSync } = await import("node:fs");
const source = JSON.parse(
  readFileSync("fixtures/lcu/candidates/h2-20261021/G1.json", "utf8"),
);
const observation = (i) => ({
  puuid: "fixture-player-" + String(i + 1).padStart(2, "0"),
  riotId: members[i].riotId,
  source: "current_lookup",
  observedAt: new Date().toISOString(),
});
await call(
  "/api/collector/accounts/observations",
  {
    rawMatch: source,
    observations: members.slice(0, 10).map((_, i) => observation(i)),
  },
  "POST",
  credential.token,
);
const eleventh = structuredClone(source);
eleventh.participantIdentities[9].player.puuid = "fixture-player-11";
await call(
  "/api/collector/accounts/observations",
  { rawMatch: eleventh, observations: [observation(10)] },
  "POST",
  credential.token,
);
members = (await call("/api/admin/members")).value.sort(
  (a, b) =>
    names.findIndex((n) => a.riotId === n + "#TEST") -
    names.findIndex((n) => b.riotId === n + "#TEST"),
);
const keys = [];
for (let i = 0; i < 12; i++) {
  const raw = structuredClone(source);
  raw.gameId = (9000000000000000000001n + BigInt(i)).toString();
  raw.gameCreation = Date.parse("2026-10-20T11:00:00Z") + i * 3600000;
  raw.participants[0].stats.deaths = 0;
  raw.participants[0].stats.item0 = 999999;
  if (i === 11) raw.participantIdentities[9].player.puuid = members[10].puuid;
  const rolesByPuuid = Object.fromEntries(
    raw.participantIdentities.map((p, index) => [
      p.player.puuid,
      roles[index % 5],
    ]),
  );
  const ack = (
    await call(
      "/api/collector/matches/ingest",
      { rawMatch: raw, schemaVersion: 1, clientSubmissionId: "web-seed-" + i },
      "POST",
      credential.token,
    )
  ).value;
  await call(
    "/api/collector/matches/" + encodeURIComponent(ack.matchKey) + "/confirm",
    { rolesByPuuid, clientSubmissionId: "web-confirm-" + i },
    "POST",
    credential.token,
  );
  keys.push(ack.matchKey);
}
await waitFor(
  async () => (await fetch(origin + "/api/rankings")).status === 200,
);
const adminCode = env.ADMIN_LOGIN_CODE;
const nextCollectorCode = collectorCode;
writeFileSync(
  "test-results/web-state.json",
  JSON.stringify({
    adminCode,
    cookie,
    csrf,
    members,
    keys,
    collectorCode: nextCollectorCode,
  }),
  { mode: 0o600 },
);
// Test-only process control, bound to loopback and started solely by this script.
const control = createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/stop") await stop();
    else if (req.method === "POST" && req.url === "/start") await start();
    else if (req.url !== "/ready") {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200);
    res.end("ready");
  } catch {
    res.writeHead(500);
    res.end("fixture process error");
  }
});
control.listen(18081, "127.0.0.1", () =>
  console.log("Isolated Spring/PostgreSQL browser fixture ready"),
);
async function shutdown() {
  control.close();
  await stop();
  log.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
