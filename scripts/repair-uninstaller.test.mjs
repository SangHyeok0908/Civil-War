import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "cw repair "));
  t.after(() => rm(root, { recursive: true, force: true }));
  const installDir = join(root, "program"),
    dataDir = join(root, "data"),
    backupRoot = join(root, "backups");
  await mkdir(installDir);
  await mkdir(dataDir);
  await writeFile(join(dataDir, "credential.bin"), "encrypted-credential");
  await writeFile(join(dataDir, "collector.sqlite"), "untouched-db");
  const good = Buffer.alloc(1056);
  good.write("MZ");
  good.writeUInt32LE(1, 1024);
  Buffer.from("efbeadde4e756c6c736f6674496e7374", "hex").copy(good, 1028);
  good.writeUInt32LE(32, 1048);
  good.writeUInt32LE(crc32(good.subarray(512, -4)), 1052);
  const bad = Buffer.from(good);
  bad[700] = 1;
  const target = join(installDir, "Uninstall Civil War Collector.exe");
  const replacement = join(root, "replacement.exe");
  await writeFile(target, bad);
  await writeFile(replacement, good);
  return {
    target,
    good,
    bad,
    options: {
      installDir,
      dataDir,
      backupRoot,
      replacement,
      expectedOriginalHash: hash(bad),
      expectedReplacementHash: hash(good),
      checkIdle: async () => {},
    },
  };
}

test("repair replaces only the known uninstaller after preserving data and the original file", async (t) => {
  const { repairUninstaller } = await import("./repair-uninstaller.mjs");
  const f = await fixture(t);
  const result = await repairUninstaller(f.options);
  assert.equal(result.status, "repaired");
  assert.deepEqual(await readFile(f.target), f.good);
  assert.deepEqual(
    await readFile(join(result.backupDirectory, "original-uninstaller.exe")),
    f.bad,
  );
  for (const [name, expected] of [
    ["credential.bin", "encrypted-credential"],
    ["collector.sqlite", "untouched-db"],
  ]) {
    assert.equal(
      await readFile(join(f.options.dataDir, name), "utf8"),
      expected,
    );
    assert.equal(
      await readFile(join(result.backupDirectory, "data", name), "utf8"),
      expected,
    );
  }
  assert.equal((await repairUninstaller(f.options)).status, "already-repaired");
  assert.equal((await readdir(f.options.backupRoot)).length, 1);
});

test("an unknown installed file is rejected without creating backups or modifying files", async (t) => {
  const { repairUninstaller } = await import("./repair-uninstaller.mjs");
  const f = await fixture(t);
  await writeFile(f.target, "unknown-version");
  await assert.rejects(repairUninstaller(f.options), /UNEXPECTED_UNINSTALLER/);
  assert.equal(await readFile(f.target, "utf8"), "unknown-version");
  await assert.rejects(readdir(f.options.backupRoot), { code: "ENOENT" });
});

test("a changed replacement is rejected before any installed file is changed", async (t) => {
  const { repairUninstaller } = await import("./repair-uninstaller.mjs");
  const f = await fixture(t);
  await writeFile(f.options.replacement, "changed-payload");
  await assert.rejects(repairUninstaller(f.options), /REPAIR_PAYLOAD_MISMATCH/);
  assert.deepEqual(await readFile(f.target), f.bad);
});

test("running collector and symlink targets are rejected", async (t) => {
  const { repairUninstaller } = await import("./repair-uninstaller.mjs");
  const f = await fixture(t);
  await assert.rejects(
    repairUninstaller({
      ...f.options,
      checkIdle: async () => {
        throw new Error("COLLECTOR_RUNNING");
      },
    }),
    /COLLECTOR_RUNNING/,
  );
  await rm(f.target);
  await symlink(f.options.replacement, f.target);
  await assert.rejects(repairUninstaller(f.options), /UNSAFE_PATH/);
  assert.deepEqual(await readFile(f.options.replacement), f.good);
});
