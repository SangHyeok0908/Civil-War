import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createLoop, readConfig, resetState } from "./main.mjs";
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

test("--reset은 halted를 idle로 되돌린다", async () => {
  const path = await tempState({
    phase: "halted",
    failedImageId: "sha256:bad",
    backupFile: "a.dump",
  });
  const logs = [];
  assert.equal(await resetState(path, (l) => logs.push(l)), 0);
  const state = await loadState(path);
  assert.equal(state.phase, "idle");
  assert.equal(state.failedImageId, null);
});

test("--reset은 failedImageId만 있어도 지운다", async () => {
  const path = await tempState({ phase: "idle", failedImageId: "sha256:bad" });
  assert.equal(await resetState(path, () => {}), 0);
  assert.equal((await loadState(path)).failedImageId, null);
});

test("--reset은 교체 진행 중 상태를 거부한다", async () => {
  for (const phase of ["starting-new", "backing-up"]) {
    const path = await tempState({ phase, failedImageId: null });
    assert.equal(await resetState(path, () => {}), 1);
    assert.equal((await loadState(path)).phase, phase);
  }
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
    failedImageId: "sha256:new",
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
