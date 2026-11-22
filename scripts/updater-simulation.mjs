// 실제 Docker로 서버 자동 교체·되돌림을 흉내 내는 개발용 시험. pnpm test에는 포함하지 않는다.
// 사용 전: 서버 JAR 빌드(./apps/server/gradlew -p apps/server bootJar)와
//          docker build -t cw-updater:local infra/home-server/updater
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SIM = join(ROOT, "scripts", "updater-simulation");
const PROJECT = "cw-updater-sim";
const DB = "cw_collector_acceptance";
const DB_USER = "cw_collector_acceptance";
const CURRENT = "civil-war-server:current";
const PREVIOUS = "civil-war-server:previous";
const MASTER = "cw-sim/server:master";
const UPDATER_IMAGE = "cw-updater:local";
const TAGS = {
  a: "cw-sim/server-a:1",
  b: "cw-sim/server-b:1",
  bad: "cw-sim/bad-server:1",
  c: "cw-sim/bad-server-slow:1",
};
const DEADLINE_MS = 120_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sh(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return {
    code: result.status ?? 1,
    out: (result.stdout ?? "").trim(),
    err: (result.stderr ?? "").trim(),
  };
}

function docker(args, options) {
  return sh("docker", args, options);
}

function mustDocker(args, options) {
  const r = docker(args, options);
  if (r.code !== 0) {
    throw new Error(`docker ${args.join(" ")} 실패: ${r.err || r.out}`);
  }
  return r.out;
}

let deployDir = null;
function compose(args, options) {
  return docker(
    [
      "compose",
      "-p",
      PROJECT,
      "-f",
      "compose.yml",
      "-f",
      "compose.sim.yml",
      ...args,
    ],
    { cwd: deployDir, ...options },
  );
}

function mustCompose(args) {
  const r = compose(args);
  if (r.code !== 0) {
    throw new Error(`docker compose ${args.join(" ")} 실패: ${r.err || r.out}`);
  }
  return r.out;
}

function psql(sql) {
  const r = compose([
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    DB_USER,
    "-d",
    DB,
    "-tAc",
    sql,
  ]);
  if (r.code !== 0) throw new Error(`psql 실패: ${r.err || r.out}`);
  return r.out;
}

const tableExists = (name) =>
  psql(`SELECT to_regclass('public.${name}') IS NOT NULL`) === "t";

const imageId = (ref) => {
  const r = docker(["image", "inspect", "--format", "{{.Id}}", ref]);
  return r.code === 0 ? r.out : null;
};

function serverContainer() {
  const id = compose(["ps", "-aq", "server"]).out.split("\n")[0];
  return id || null;
}

function serverImage() {
  const id = serverContainer();
  if (!id) return null;
  const r = docker(["inspect", "--format", "{{.Image}}", id]);
  return r.code === 0 ? r.out : null;
}

// 이미지 ID만이 아니라 컨테이너가 실행 중이고 healthy인지도 확인한다.
function serverHealthy() {
  const id = serverContainer();
  if (!id) return false;
  const r = docker([
    "inspect",
    "--format",
    "{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{end}}",
    id,
  ]);
  return r.code === 0 && r.out === "true healthy";
}

const serverIsOn = (id) => serverImage() === id && serverHealthy();

const countLogs = (pattern) =>
  updaterLogs()
    .split("\n")
    .filter((line) => pattern.test(line)).length;

function updaterLogs(tail = "all") {
  const r = compose(["logs", "--no-color", "--tail", String(tail), "updater"]);
  return `${r.out}\n${r.err}`;
}

const backupFiles = () =>
  readdirSync(join(deployDir, "backups")).filter((n) => n.endsWith(".dump"));

function readState() {
  try {
    return JSON.parse(
      readFileSync(join(deployDir, "backups", "updater-state.json"), "utf8"),
    );
  } catch {
    return null;
  }
}

// 조건이 참이 될 때까지 기다린다. 시간이 지나면 이유와 함께 실패한다.
async function waitFor(description, check, timeoutMs = DEADLINE_MS) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try {
      last = check();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(1000);
  }
  throw new Error(`${description} (제한 시간 ${timeoutMs / 1000}초 초과)`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findJar() {
  const dir = join(ROOT, "apps", "server", "build", "libs");
  const jars = existsSync(dir)
    ? readdirSync(dir).filter(
        (n) => n.endsWith("-provisional.jar") && !n.includes("-plain"),
      )
    : [];
  if (jars.length === 0) {
    throw new Error(
      "서버 JAR가 없습니다. ./apps/server/gradlew -p apps/server bootJar를 먼저 실행하세요.",
    );
  }
  return join(dir, jars.sort().at(-1));
}

function preflight() {
  if (docker(["info"]).code !== 0)
    throw new Error("Docker에 연결할 수 없습니다.");
  if (!imageId(UPDATER_IMAGE)) {
    throw new Error(
      `${UPDATER_IMAGE} 이미지가 없습니다. docker build -t ${UPDATER_IMAGE} infra/home-server/updater를 먼저 실행하세요.`,
    );
  }
  for (const ref of [CURRENT, PREVIOUS]) {
    if (imageId(ref)) {
      throw new Error(
        `${ref} 이미지가 이미 있어 시작하지 않습니다. 다른 환경과 이름표가 겹칩니다. 이전 모의 시험이 중단된 흔적이라면 직접 정리하세요: 그 시험의 임시 폴더(cw-updater-sim-*)에서 docker compose -p ${PROJECT} -f compose.yml -f compose.sim.yml down -v 를 실행하고 ${CURRENT}, ${PREVIOUS} 이름표를 docker rmi로 지웁니다. 이름표는 자동으로 지우지 않습니다.`,
      );
    }
  }
}

function buildImages(jar, buildDir) {
  const ctx = join(buildDir, "server-ctx");
  mkdirSync(ctx);
  copyFileSync(jar, join(ctx, "server.jar"));
  copyFileSync(
    join(ROOT, "infra", "home-server", "Dockerfile"),
    join(ctx, "Dockerfile"),
  );
  copyFileSync(
    join(ROOT, "infra", "home-server", ".dockerignore"),
    join(ctx, ".dockerignore"),
  );
  const goodBuild = (label, tag) =>
    mustDocker([
      "build",
      "-q",
      "--label",
      `sim.label=${label}`,
      "--label",
      `org.opencontainers.image.revision=${label.repeat(7)}`,
      "-t",
      tag,
      ctx,
    ]);
  goodBuild("a", TAGS.a);
  goodBuild("b", TAGS.b);
  const badBuild = (label, sleepSeconds, tag) =>
    mustDocker([
      "build",
      "-q",
      "-f",
      join(SIM, "bad-server.Dockerfile"),
      "--build-arg",
      `SIM_SLEEP=${sleepSeconds}`,
      "--build-arg",
      `SIM_LABEL=${label}`,
      "--label",
      `org.opencontainers.image.revision=${label.padEnd(7, "0")}`,
      "-t",
      tag,
      SIM,
    ]);
  badBuild("bad", 0, TAGS.bad);
  badBuild("slowc", 30, TAGS.c);
  assert(
    new Set(Object.values(TAGS).map(imageId)).size === 4,
    "모의 이미지 네 개의 ID가 서로 달라야 합니다.",
  );
}

function prepareDeployDir(dir) {
  mkdirSync(dir);
  deployDir = dir;
  copyFileSync(
    join(ROOT, "infra", "home-server", "compose.yml"),
    join(dir, "compose.yml"),
  );
  copyFileSync(join(SIM, "compose.sim.yml"), join(dir, "compose.sim.yml"));
  mkdirSync(join(dir, "backups"));
  mkdirSync(join(dir, "secrets"));
  writeFileSync(
    join(dir, ".env"),
    [
      `POSTGRES_PASSWORD=${randomBytes(12).toString("hex")}`,
      "ADMIN_LOGIN_CODE=sim-login-code-1234",
      "SERVER_ORIGIN=https://sim.example.test",
      "",
    ].join("\n"),
  );
  writeFileSync(join(dir, "secrets", "cloudflare-tunnel-token.txt"), "dummy\n");
  writeFileSync(
    join(dir, "secrets", "discord-webhook-url.txt"),
    "https://example.invalid/not-discord\n",
  );
}

const tag = (from, to) => mustDocker(["tag", from, to]);

const scenarios = [
  [
    "정상 이미지로 시작하고 표식 데이터를 넣는다",
    async (ctx) => {
      tag(TAGS.a, CURRENT);
      mustCompose([
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "180",
        "postgres",
        "server",
        "cloudflared",
      ]);
      psql("CREATE TABLE sim_keep (id int); INSERT INTO sim_keep VALUES (1)");
      mustCompose(["up", "-d", "updater"]);
      ctx.idA = imageId(TAGS.a);
      assert(
        serverImage() === ctx.idA,
        "서버가 이미지 A로 실행 중이어야 합니다.",
      );
      assert(
        psql("SELECT count(*) FROM sim_keep") === "1",
        "sim_keep 행이 1개여야 합니다.",
      );
    },
  ],
  [
    "성공: 새 이미지로 교체되고 백업 1개가 남으며 알림이 없다",
    async (ctx) => {
      ctx.idB = imageId(TAGS.b);
      tag(TAGS.b, MASTER);
      await waitFor(
        "서버가 B로 바뀌고 healthy가 됨",
        () => serverIsOn(ctx.idB),
        60_000 + 30_000,
      );
      await waitFor(
        "상태가 idle로 돌아옴",
        () => readState()?.phase === "idle",
        30_000,
      );
      assert(
        backupFiles().length === 1,
        `백업이 1개여야 합니다: ${backupFiles()}`,
      );
      assert(imageId(PREVIOUS) === ctx.idA, "previous 이름표가 A여야 합니다.");
      assert(
        !/alert (skipped|sent|failed)/.test(updaterLogs()),
        "성공 교체에서 알림 로그가 없어야 합니다.",
      );
      assert(
        psql("SELECT count(*) FROM sim_keep") === "1",
        "sim_keep 행이 남아야 합니다.",
      );
    },
  ],
  [
    "되돌림: 시작에 실패하는 이미지는 B로 되돌리고 DB를 복원한다",
    async (ctx) => {
      ctx.idBad = imageId(TAGS.bad);
      tag(TAGS.bad, MASTER);
      await waitFor("alert skipped: rolled-back 로그", () =>
        /alert skipped: rolled-back/.test(updaterLogs()),
      );
      await waitFor(
        "서버가 B로 돌아와 healthy가 됨",
        () => serverIsOn(ctx.idB),
        90_000,
      );
      assert(!tableExists("sim_bad"), "복원 후 sim_bad 표가 없어야 합니다.");
      assert(
        psql("SELECT count(*) FROM sim_keep") === "1",
        "sim_keep 행이 남아야 합니다.",
      );
      assert(
        readState()?.failedImageId === ctx.idBad,
        "실패한 이미지 ID가 상태에 기록돼야 합니다.",
      );
    },
  ],
  [
    "같은 나쁜 이미지는 다시 시도하지 않는다",
    async () => {
      const before = serverContainer();
      const startedBefore = mustDocker([
        "inspect",
        "--format",
        "{{.State.StartedAt}}",
        before,
      ]);
      await sleep(15_000); // 확인 주기(5초)의 3배
      assert(
        serverContainer() === before,
        "서버 컨테이너가 다시 만들어지면 안 됩니다.",
      );
      const startedAfter = mustDocker([
        "inspect",
        "--format",
        "{{.State.StartedAt}}",
        before,
      ]);
      assert(startedAfter === startedBefore, "서버가 다시 시작되면 안 됩니다.");
      assert(
        /이전에 되돌린 이미지라 다시 시도하지 않습니다/.test(updaterLogs()),
        "건너뛴 로그가 있어야 합니다.",
      );
    },
  ],
  [
    "재시작 복구: 교체 도중 교체 담당이 죽어도 B로 돌아온다",
    async (ctx) => {
      const rolledBackBefore = countLogs(/alert skipped: rolled-back/);
      tag(TAGS.c, MASTER);
      await waitFor(
        "상태가 starting-new",
        () => readState()?.phase === "starting-new",
        60_000,
      );
      const updater = compose(["ps", "-q", "updater"]).out;
      mustDocker(["kill", updater]);
      await waitFor(
        "나쁜 이미지가 sim_bad를 만듦",
        () => tableExists("sim_bad"),
        60_000,
      );
      mustCompose(["up", "-d", "updater"]);
      await waitFor(
        "서버가 B로 돌아와 healthy가 됨",
        () => serverIsOn(ctx.idB),
        DEADLINE_MS,
      );
      await waitFor(
        "상태가 idle로 돌아옴",
        () => readState()?.phase === "idle",
        30_000,
      );
      assert(!tableExists("sim_bad"), "복원 후 sim_bad 표가 없어야 합니다.");
      assert(
        psql("SELECT count(*) FROM sim_keep") === "1",
        "sim_keep 행이 남아야 합니다.",
      );
      assert(
        countLogs(/alert skipped: rolled-back/) > rolledBackBefore,
        "복구 후 rolled-back 알림 로그가 새로 늘어야 합니다.",
      );
    },
  ],
];

let tmpDir = null;
let cleanedUp = false;
function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  if (deployDir) {
    compose(["down", "-v", "--remove-orphans"], { stdio: "ignore" });
  }
  for (const ref of [CURRENT, PREVIOUS, MASTER, ...Object.values(TAGS)]) {
    docker(["rmi", ref], { stdio: "ignore" });
  }
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
}

let sawPreflight = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`${signal} 수신: 정리 후 종료합니다.`);
    // 사전 점검 전에는 남의 이름표를 지우지 않도록 정리하지 않는다.
    if (sawPreflight) cleanup();
    process.exit(130);
  });
}

async function main() {
  const started = Date.now();
  const jar = findJar();
  preflight();
  sawPreflight = true;
  const dir = mkdtempSync(join(tmpdir(), "cw-updater-sim-"));
  tmpDir = dir;
  let failed = false;
  try {
    buildImages(jar, dir);
    prepareDeployDir(join(dir, "deploy"));
  } catch (error) {
    console.log(`FAIL 0 준비: ${error.message}`);
    failed = true;
  }
  const ctx = {};
  if (!failed) {
    for (const [index, [name, fn]] of scenarios.entries()) {
      const t0 = Date.now();
      try {
        await fn(ctx);
        console.log(
          `PASS ${index + 1} ${name} (${Math.round((Date.now() - t0) / 1000)}s)`,
        );
      } catch (error) {
        console.log(`FAIL ${index + 1} ${name}: ${error.message}`);
        failed = true;
        break;
      }
    }
  }
  if (failed && deployDir) {
    console.log("--- 교체 담당 로그 마지막 80줄 ---");
    console.log(updaterLogs(80));
  }
  cleanup();
  console.log(
    `${failed ? "실패" : "통과"} (${Math.round((Date.now() - started) / 1000)}s)`,
  );
  return failed ? 1 : 0;
}

let code = 1;
try {
  code = await main();
} catch (error) {
  console.log(`FAIL 시작 전 점검: ${error.message}`);
  try {
    if (sawPreflight) cleanup();
  } catch {}
}
process.exit(code);
