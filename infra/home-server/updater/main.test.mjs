import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { readConfig, resetState } from "./main.mjs";
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
