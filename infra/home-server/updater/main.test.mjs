import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  createLoop,
  guardLoopStart,
  parseArgs,
  readConfig,
  resetState,
  restoreBackup,
  retryState,
} from "./main.mjs";
import { loadState, saveState } from "./state.mjs";

const SOURCE = "ghcr.io/sanghyeok0908/civil-war-server:master";

test("readConfig는 기본값을 채운다", () => {
  assert.deepEqual(readConfig({ SOURCE_IMAGE: SOURCE }), {
    sourceRef: SOURCE,
    projectName: "cw-collector-acceptance",
    intervalSeconds: 120,
    keepBackups: 10,
    waitTimeoutSeconds: 300,
    statePath: "/backups/updater-state.json",
    webhookFile: "/run/secrets/discord_webhook",
    pull: "always",
  });
});

test("readConfig는 환경값을 덮어쓰고 잘못된 값은 거부한다", () => {
  const config = readConfig({
    SOURCE_IMAGE: SOURCE,
    UPDATER_PULL: "never",
    CHECK_INTERVAL_SECONDS: "5",
  });
  assert.equal(config.pull, "never");
  assert.equal(config.intervalSeconds, 5);
  assert.throws(() => readConfig({}));
  for (const bad of ["abc", "0", "-3", "1.5"]) {
    assert.throws(() =>
      readConfig({ SOURCE_IMAGE: SOURCE, CHECK_INTERVAL_SECONDS: bad }),
    );
  }
  assert.throws(() => readConfig({ SOURCE_IMAGE: SOURCE, UPDATER_PULL: "x" }));
});

async function tempState(state) {
  const dir = await mkdtemp(join(tmpdir(), "cw-main-"));
  const path = join(dir, "state.json");
  if (state) await saveState(path, state);
  return path;
}

test("--reset은 halted를 idle로 되돌리되 실패한 이미지는 계속 막는다", async () => {
  const path = await tempState({
    phase: "halted",
    failedImageId: "sha256:bad",
    backupFile: "a.dump",
  });
  assert.equal(await resetState(path, () => {}), 0);
  const state = await loadState(path);
  assert.equal(state.phase, "idle");
  assert.equal(state.failedImageId, "sha256:bad");
});

test("--reset은 idle에서 아무것도 바꾸지 않는다", async () => {
  const path = await tempState({ phase: "idle", failedImageId: "sha256:bad" });
  assert.equal(await resetState(path, () => {}), 0);
  assert.equal((await loadState(path)).failedImageId, "sha256:bad");
});

test("--reset과 --retry는 교체 진행 중 상태를 거부한다", async () => {
  for (const phase of ["starting-new", "backing-up"]) {
    for (const fn of [resetState, retryState]) {
      const path = await tempState({ phase, failedImageId: "sha256:bad" });
      assert.equal(await fn(path, () => {}), 1);
      const state = await loadState(path);
      assert.equal(state.phase, phase);
      assert.equal(state.failedImageId, "sha256:bad");
    }
  }
});

test("--retry는 idle의 failedImageId를 지운다", async () => {
  const path = await tempState({ phase: "idle", failedImageId: "sha256:bad" });
  assert.equal(await retryState(path, () => {}), 0);
  const state = await loadState(path);
  assert.equal(state.phase, "idle");
  assert.equal(state.failedImageId, null);
});

test("--retry는 halted를 idle로 풀고 failedImageId도 지운다", async () => {
  const path = await tempState({
    phase: "halted",
    failedImageId: "sha256:bad",
  });
  assert.equal(await retryState(path, () => {}), 0);
  const state = await loadState(path);
  assert.equal(state.phase, "idle");
  assert.equal(state.failedImageId, null);
});

test("--retry는 지울 내용이 없으면 그대로 둔다", async () => {
  const path = await tempState({ phase: "idle", failedImageId: null });
  const logs = [];
  assert.equal(await retryState(path, (l) => logs.push(l)), 0);
  assert.equal(logs.length, 1);
});

test("--reset은 읽을 수 없는 상태 파일을 기본값으로 덮어쓴다", async () => {
  const path = await tempState(null);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, "{broken");
  const logs = [];
  assert.equal(await resetState(path, (l) => logs.push(l)), 0);
  assert.equal((await loadState(path)).phase, "idle");
  assert.ok(logs.length >= 1);
});

function fakeOps() {
  const calls = [];
  const logs = [];
  const ops = {
    calls,
    logs,
    log: (l) => logs.push(l),
    now: () => new Date("2026-11-21T00:00:00Z"),
    saveState: async () => {},
    pullSource: async () => calls.push("pullSource"),
    imageId: async (ref) => {
      calls.push(`imageId:${ref}`);
      return ref.endsWith(":current") ? "sha256:cur" : "sha256:new";
    },
    imageRevision: async () => "abc1234",
    tag: async () => {},
    stop: async (s) => calls.push(`stop:${s.join(",")}`),
    start: async (s) => calls.push(`start:${s.join(",")}`),
    recreateServer: async () => calls.push("recreateServer"),
    backup: async () => calls.push("backup"),
    restore: async () => calls.push("restore"),
    pruneBackups: async () => {},
    alert: async (kind, info) => calls.push(`alert:${kind}:${info.step}`),
  };
  return ops;
}

const CYCLE = {
  sourceRef: "ghcr.io/example/civil-war-server:master",
  currentRef: "civil-war-server:current",
  previousRef: "civil-war-server:previous",
  keepBackups: 10,
};

test("주기마다 상태 파일을 다시 읽어 --reset 결과를 반영한다", async () => {
  const path = await tempState({
    phase: "halted",
    failedImageId: "sha256:old-bad",
  });
  const ops = fakeOps();
  const loop = createLoop({ ops, cycleConfig: CYCLE, statePath: path });
  await loop.tick();
  assert.deepEqual(ops.calls, []);
  assert.equal(await resetState(path, () => {}), 0);
  await loop.tick();
  assert.ok(ops.calls.includes("pullSource"));
  assert.ok(ops.calls.includes("recreateServer"));
});

test("--reset 뒤에도 같은 이미지는 다시 시도하지 않고 --retry 뒤에는 시도한다", async () => {
  const path = await tempState({
    phase: "halted",
    failedImageId: "sha256:new",
  });
  const ops = fakeOps();
  const loop = createLoop({ ops, cycleConfig: CYCLE, statePath: path });
  assert.equal(await resetState(path, () => {}), 0);
  await loop.tick();
  assert.ok(!ops.calls.includes("recreateServer"));
  assert.ok(ops.logs.some((l) => l.includes("다시 시도하지 않습니다")));
  assert.equal(await retryState(path, () => {}), 0);
  await loop.tick();
  assert.ok(ops.calls.includes("recreateServer"));
});

test("다시 읽은 상태가 교체 진행 중이면 recover를 실행한다", async () => {
  const path = await tempState({
    phase: "starting-new",
    previousId: "sha256:cur",
    candidateId: "sha256:new",
    backupFile: "a.dump",
  });
  const ops = fakeOps();
  const loop = createLoop({ ops, cycleConfig: CYCLE, statePath: path });
  await loop.tick();
  assert.ok(ops.calls.includes("restore"));
  assert.ok(!ops.calls.includes("pullSource"));
});

test("읽을 수 없는 상태는 매번 다시 시도하고 알림은 한 번만 보낸다", async () => {
  const path = await tempState(null);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, "{broken");
  const ops = fakeOps();
  const loop = createLoop({ ops, cycleConfig: CYCLE, statePath: path });
  await loop.tick();
  await loop.tick();
  assert.deepEqual(
    ops.calls.filter((c) => c.startsWith("alert:")),
    ["alert:rollback-failed:state-file"],
  );
  await saveState(path, { phase: "idle" });
  await loop.tick();
  assert.ok(ops.calls.includes("pullSource"));
  await writeFile(path, "{broken");
  await loop.tick();
  assert.equal(ops.calls.filter((c) => c.startsWith("alert:")).length, 2);
});

test("parseArgs는 알려진 인자만 받고 나머지는 invalid로 돌린다", () => {
  assert.deepEqual(parseArgs([]), { mode: "loop" });
  assert.deepEqual(parseArgs(["--reset"]), { mode: "reset" });
  assert.deepEqual(parseArgs(["--retry"]), { mode: "retry" });
  assert.deepEqual(parseArgs(["--test-alert"]), { mode: "test-alert" });
  assert.deepEqual(parseArgs(["--restore", "a.dump"]), {
    mode: "restore",
    file: "a.dump",
  });
  for (const bad of [
    ["--rest"],
    ["reset"],
    ["--restore"],
    ["--restore", "--reset"],
    ["--reset", "--retry"],
    ["--restore", "a.dump", "x"],
  ]) {
    assert.equal(parseArgs(bad).mode, "invalid", bad.join(" "));
  }
});

function execReturning(result) {
  const calls = [];
  const exec = async (command, args) => {
    calls.push([command, ...args]);
    if (result instanceof Error) throw result;
    return result;
  };
  return { exec, calls };
}

test("일회성 컨테이너에서는 반복을 시작하지 않고 종료 코드 2를 돌려준다", async () => {
  const { exec, calls } = execReturning({ code: 0, stdout: "True\n" });
  const logs = [];
  const code = await guardLoopStart({
    exec,
    hostname: "abc123",
    log: (l) => logs.push(l),
  });
  assert.equal(code, 2);
  assert.deepEqual(calls[0], [
    "docker",
    "inspect",
    "--format",
    '{{ index .Config.Labels "com.docker.compose.oneoff" }}',
    "abc123",
  ]);
  assert.deepEqual(logs, ["일회성 실행에서는 교체 반복을 시작하지 않습니다."]);
});

test("일회성이 아니거나 확인에 실패하면 반복을 시작한다", async () => {
  for (const result of [
    { code: 0, stdout: "False\n" },
    { code: 0, stdout: "\n" },
    { code: 1, stdout: "" },
    new Error("docker 없음"),
  ]) {
    const { exec } = execReturning(result);
    const logs = [];
    const code = await guardLoopStart({
      exec,
      hostname: "abc123",
      log: (l) => logs.push(l),
    });
    assert.equal(code, null);
    const failed = result instanceof Error || result.code !== 0;
    assert.equal(logs.length, failed ? 1 : 0);
  }
});

test("--restore는 멈춤 상태에서 지정한 백업만 복원한다", async () => {
  const restored = [];
  const ops = { restore: async (name) => restored.push(name) };
  const file = "20261121-030405-abcdef1.dump";
  const halted = await tempState({ phase: "halted", backupFile: file });
  assert.equal(await restoreBackup(halted, file, ops, () => {}), 0);
  assert.deepEqual(restored, [file]);
  for (const phase of ["idle", "backing-up", "starting-new"]) {
    const path = await tempState({ phase });
    assert.equal(await restoreBackup(path, file, ops, () => {}), 1);
  }
  for (const bad of [
    "../x.dump",
    "manual.dump",
    "a/b.dump",
    "updater-state.json",
  ]) {
    assert.equal(await restoreBackup(halted, bad, ops, () => {}), 1);
  }
  assert.deepEqual(restored, [file]);
});

test("--restore는 복원이 실패하면 종료 코드 1을 돌려준다", async () => {
  const ops = {
    restore: async () => {
      throw new Error("boom");
    },
  };
  const path = await tempState({ phase: "halted" });
  const logs = [];
  assert.equal(
    await restoreBackup(path, "20261121-030405-abcdef1.dump", ops, (l) =>
      logs.push(l),
    ),
    1,
  );
  assert.ok(logs.some((l) => l.includes("복원 실패")));
});
