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
  DATABASE_URL: "jdbc:postgresql://localhost:55432/cw_web_test",
  DATABASE_USER: "cw_test",
  DATABASE_PASSWORD: "cw_test_only",
  SERVER_ORIGIN: origin,
};
const args = [
  "-jar",
  jar,
  "--spring.profiles.active=dev",
  "--logging.level.root=WARN",
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
function code() {
  const output = execFileSync(java, [...args, "admin:code"], {
    env,
    encoding: "utf8",
    timeout: 30000,
  });
  const value = output.match(/ADMIN_CODE=([^\s]+)/)?.[1];
  if (!value) throw Error("No fixture admin code");
  return value;
}
code(); // Run real Flyway migration in the non-web command, then reset only this isolated fixture DB.
if (sql("select current_database()") !== "cw_web_test")
  throw Error("Unsafe fixture database");
sql(
  "TRUNCATE role_reference_samples,member_reference_links,evaluation_generations,scoring_versions,audit_log,recalculation_jobs,match_participants,matches,collector_credentials,admin_sessions,enrollment_codes,members CASCADE; UPDATE service_state SET source_revision=0,desired_scoring_version=null,active_generation_id=null",
);
const firstCode = code();
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
const members = [];
for (let i = 0; i < 11; i++)
  members.push(
    (
      await call("/api/admin/members", {
        puuid: "fixture-player-" + String(i + 1).padStart(2, "0"),
        riotId: "Fixture" + (i + 1) + "#TEST",
        displayName: names[i],
        seedSkill: 50,
        primaryRole: roles[i % 5],
        secondaryRole: roles[(i + 1) % 5],
        allowedRoles: roles,
      })
    ).value,
  );
const collectorCode = (
  await call("/api/admin/codes", {
    scope: "collector",
    memberId: members[0].id,
  })
).value.code;
const credential = (
  await call("/api/collector/enroll", {
    code: collectorCode,
    currentPuuid: members[0].puuid,
  })
).value;
const { readFileSync } = await import("node:fs");
const source = JSON.parse(
  readFileSync("fixtures/lcu/candidates/h2-20261021/G1.json", "utf8"),
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
const adminCode = (await call("/api/admin/codes", { scope: "admin" })).value
  .code;
const nextCollectorCode = (
  await call("/api/admin/codes", {
    scope: "collector",
    memberId: members[0].id,
  })
).value.code;
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
