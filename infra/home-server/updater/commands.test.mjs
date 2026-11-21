import assert from "node:assert/strict";
import { mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createDockerOps } from "./commands.mjs";

const PROJECT = "cw-collector-acceptance";
const C = [
  "compose",
  "-p",
  PROJECT,
  "-f",
  "/deploy/compose.yml",
  "--project-directory",
  "/deploy",
];
const SOURCE = "ghcr.io/example/civil-war-server:master";

async function setup(options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "cw-commands-"));
  const calls = [];
  const logs = [];
  const results = options.results ?? {};
  const run = async (command, args, io) => {
    calls.push({ command, args, io });
    const key = args.join(" ");
    const result = Object.entries(results).find(([k]) => key.includes(k));
    if (io?.stdoutFile && options.writeBytes !== undefined) {
      await writeFile(io.stdoutFile, "x".repeat(options.writeBytes));
    }
    return result ? result[1] : { code: 0, stdout: "" };
  };
  const ops = createDockerOps({
    projectName: PROJECT,
    composeFile: "/deploy/compose.yml",
    projectDir: "/deploy",
    backupDir: dir,
    sourceRef: SOURCE,
    waitTimeoutSeconds: 300,
    webhookUrl: options.webhookUrl ?? null,
    statePath: join(dir, "state.json"),
    run,
    pull: options.pull,
    fetchImpl: options.fetchImpl,
    log: (line) => logs.push(line),
  });
  return { ops, calls, logs, dir };
}

test("recreateServer는 서버만 --no-deps로 다시 만든다", async () => {
  const { ops, calls } = await setup();
  await ops.recreateServer();
  assert.deepEqual(calls[0], {
    command: "docker",
    args: [
      ...C,
      "up",
      "-d",
      "--no-deps",
      "--force-recreate",
      "--wait",
      "--wait-timeout",
      "300",
      "server",
    ],
    io: undefined,
  });
});

test("recreateServer는 종료 코드가 0이 아니면 throw", async () => {
  const { ops } = await setup({ results: { up: { code: 1, stdout: "" } } });
  await assert.rejects(() => ops.recreateServer());
});

test("stop·start는 지정한 서비스만 넘긴다", async () => {
  const { ops, calls } = await setup();
  await ops.stop(["cloudflared", "server"]);
  await ops.start(["cloudflared", "server"]);
  assert.deepEqual(calls[0].args, [...C, "stop", "cloudflared", "server"]);
  assert.deepEqual(calls[1].args, [...C, "start", "cloudflared", "server"]);
});

test("stop은 실패하면 throw", async () => {
  const { ops } = await setup({ results: { stop: { code: 1, stdout: "" } } });
  await assert.rejects(() => ops.stop(["server"]));
});

test("backup은 pg_dump -Fc 출력을 파일로 보낸다", async () => {
  const { ops, calls, dir } = await setup({ writeBytes: 10 });
  await ops.backup("x.dump");
  assert.deepEqual(calls[0].args, [
    ...C,
    "exec",
    "-T",
    "postgres",
    "sh",
    "-c",
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc',
  ]);
  assert.equal(calls[0].io.stdoutFile, join(dir, "x.dump"));
});

test("backup은 종료 코드 실패나 0바이트 파일이면 throw", async () => {
  const failed = await setup({
    writeBytes: 10,
    results: { exec: { code: 1, stdout: "" } },
  });
  await assert.rejects(() => failed.ops.backup("x.dump"));
  const empty = await setup({ writeBytes: 0 });
  await assert.rejects(() => empty.ops.backup("x.dump"));
  const missing = await setup();
  await assert.rejects(() => missing.ops.backup("x.dump"));
});

test("restore는 한 트랜잭션으로 스키마를 지우고 복원한다", async () => {
  const { ops, calls, dir } = await setup();
  await ops.restore("x.dump");
  assert.deepEqual(calls[0].args, [
    ...C,
    "exec",
    "-T",
    "postgres",
    "sh",
    "-c",
    `{ printf 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;\\n'; pg_restore --no-owner -f -; } | psql -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"`,
  ]);
  assert.equal(calls[0].io.stdinFile, join(dir, "x.dump"));
});

test("restore는 실패하면 throw", async () => {
  const { ops } = await setup({ results: { exec: { code: 2, stdout: "" } } });
  await assert.rejects(() => ops.restore("x.dump"));
});

test("pullSource는 docker pull을 하고 pull never면 아무것도 하지 않는다", async () => {
  const { ops, calls } = await setup();
  await ops.pullSource();
  assert.deepEqual(calls[0], {
    command: "docker",
    args: ["pull", "--quiet", SOURCE],
    io: undefined,
  });
  const never = await setup({ pull: "never" });
  await never.ops.pullSource();
  assert.equal(never.calls.length, 0);
});

test("이미지 조회와 이름표", async () => {
  const { ops, calls } = await setup({
    results: {
      "{{.Id}}": { code: 0, stdout: "sha256:abc\n" },
      "org.opencontainers.image.revision": { code: 0, stdout: "  \n" },
    },
  });
  assert.equal(await ops.imageId("ref"), "sha256:abc");
  assert.deepEqual(calls[0].args, [
    "image",
    "inspect",
    "--format",
    "{{.Id}}",
    "ref",
  ]);
  assert.equal(await ops.imageRevision("sha256:abc"), null);
  assert.deepEqual(calls[1].args, [
    "image",
    "inspect",
    "--format",
    '{{ index .Config.Labels "org.opencontainers.image.revision" }}',
    "sha256:abc",
  ]);
  await ops.tag("sha256:abc", "civil-war-server:current");
  assert.deepEqual(calls[2].args, [
    "tag",
    "sha256:abc",
    "civil-war-server:current",
  ]);
});

test("imageId는 실패하면 null, imageRevision은 값이 있으면 돌려준다", async () => {
  const { ops } = await setup({
    results: {
      "{{.Id}}": { code: 1, stdout: "" },
      "org.opencontainers": { code: 0, stdout: "abc123\n" },
    },
  });
  assert.equal(await ops.imageId("ref"), null);
  assert.equal(await ops.imageRevision("id"), "abc123");
});

test("pruneBackups는 오래된 백업만 지우고 다른 파일은 남긴다", async () => {
  const { ops, dir } = await setup();
  const names = [
    "20260101-000000-aaaaaaa.dump",
    "20260102-000000-bbbbbbb.dump",
    "20260103-000000-ccccccc.dump",
    "updater-state.json",
  ];
  for (const name of names) await writeFile(join(dir, name), "x");
  await ops.pruneBackups(2);
  const left = (await readdir(dir)).sort();
  assert.deepEqual(left, [
    "20260102-000000-bbbbbbb.dump",
    "20260103-000000-ccccccc.dump",
    "updater-state.json",
  ]);
  await stat(join(dir, "updater-state.json"));
});

test("알림은 상태별로 정해진 로그 한 줄만 남긴다", async () => {
  const skipped = await setup();
  await skipped.ops.alert("rolled-back", {
    revision: null,
    at: new Date(),
    step: null,
  });
  assert.deepEqual(skipped.logs, ["alert skipped: rolled-back"]);

  const hook = "https://discord.com/api/webhooks/1/secret";
  const bodies = [];
  const sent = await setup({
    webhookUrl: hook,
    fetchImpl: async (url, init) => {
      bodies.push([url, init.body]);
      return { status: 204 };
    },
  });
  await sent.ops.alert("test", { revision: null, at: new Date(), step: null });
  assert.deepEqual(sent.logs, ["alert sent: test"]);
  assert.equal(bodies[0][0], hook);

  const failed = await setup({
    webhookUrl: hook,
    fetchImpl: async () => {
      throw new Error("boom");
    },
  });
  await failed.ops.alert("rollback-failed", {
    revision: null,
    at: new Date(),
    step: "x",
  });
  assert.deepEqual(failed.logs, ["alert failed: rollback-failed"]);
  assert.ok(!failed.logs.join("").includes("secret"));
});

test("saveState는 상태 파일에 저장한다", async () => {
  const { ops, dir } = await setup();
  await ops.saveState({ phase: "idle" });
  const { loadState } = await import("./state.mjs");
  assert.equal((await loadState(join(dir, "state.json"))).phase, "idle");
});

test("어떤 명령도 postgres·cloudflared·updater를 만들거나 지우지 않는다", async () => {
  const { ops, calls } = await setup({ writeBytes: 5 });
  await ops.pullSource();
  await ops.stop(["cloudflared", "server"]);
  await ops.backup("x.dump");
  await ops.tag("a", "b");
  await ops.recreateServer();
  await ops.start(["cloudflared"]);
  await ops.restore("x.dump");
  for (const { args } of calls) {
    const verb = args.find((a) => ["up", "create", "rm"].includes(a));
    if (!verb) continue;
    const rest = args.slice(args.indexOf(verb) + 1);
    for (const name of ["postgres", "cloudflared", "updater"]) {
      assert.ok(!rest.includes(name), `${verb} ${name}`);
    }
  }
});
