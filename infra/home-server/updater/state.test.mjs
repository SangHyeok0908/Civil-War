import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_STATE, loadState, saveState } from "./state.mjs";

async function tempDir() {
  return mkdtemp(join(tmpdir(), "updater-state-"));
}

test("없는 파일이면 기본 상태를 돌려준다", async () => {
  const dir = await tempDir();
  assert.deepEqual(await loadState(join(dir, "s.json")), DEFAULT_STATE);
  assert.equal(DEFAULT_STATE.phase, "idle");
});

test("저장 후 같은 값을 읽고 임시 파일이 남지 않는다", async () => {
  const dir = await tempDir();
  const path = join(dir, "s.json");
  const state = {
    ...DEFAULT_STATE,
    phase: "backing-up",
    previousId: "sha256:a",
    candidateRevision: "abc",
  };
  await saveState(path, state);
  assert.deepEqual(await loadState(path), state);
  assert.deepEqual(await readdir(dir), ["s.json"]);
});

test("깨진 JSON이면 STATE_UNREADABLE을 던진다", async () => {
  const dir = await tempDir();
  const path = join(dir, "s.json");
  await writeFile(path, "{not json");
  await assert.rejects(loadState(path), { message: "STATE_UNREADABLE" });
});
