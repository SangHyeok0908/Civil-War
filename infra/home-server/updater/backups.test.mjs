import assert from "node:assert/strict";
import test from "node:test";
import { backupFileName, selectBackupsToDelete } from "./backups.mjs";

test("백업 파일 이름을 만든다", () => {
  const at = new Date("2026-11-21T03:04:05Z");
  assert.equal(
    backupFileName(at, "abcdef1234"),
    "20261121-030405-abcdef1.dump",
  );
  assert.equal(backupFileName(at, null), "20261121-030405-unknown.dump");
});

test("오래된 백업만 삭제 대상으로 고르고 다른 이름은 건드리지 않는다", () => {
  const names = [];
  for (let i = 1; i <= 12; i++) {
    names.push(`202611${String(i).padStart(2, "0")}-000000-abcdef1.dump`);
  }
  const mixed = ["updater-state.json", "manual.dump", ...names.reverse()];
  assert.deepEqual(selectBackupsToDelete(mixed, 10), [
    "20261101-000000-abcdef1.dump",
    "20261102-000000-abcdef1.dump",
  ]);
  assert.deepEqual(selectBackupsToDelete(["manual.dump"], 0), []);
});
