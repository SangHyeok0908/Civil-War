import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { crc32 } from "node:zlib";

const require = createRequire(import.meta.url);
const builder = dirname(
  require.resolve("app-builder-lib", {
    paths: [require.resolve("electron-builder")],
  }),
);
const { UninstallerReader } = require(
  join(builder, "targets/nsis/nsisUtil.js"),
);
const { getMakeNsisPath } = require(join(builder, "toolsets/windows.js"));

function crcFixture() {
  const bytes = Buffer.alloc(1056);
  bytes.write("MZ");
  bytes.writeUInt32LE(1, 1024);
  Buffer.from("efbeadde4e756c6c736f6674496e7374", "hex").copy(bytes, 1028);
  bytes.writeUInt32LE(32, 1048);
  bytes.writeUInt32LE(crc32(bytes.subarray(512, -4)), 1052);
  return bytes;
}

test("integrity validation accepts the stored CRC and rejects changed executable bytes", async () => {
  const { verifyNsisIntegrity } = await import("./nsis-integrity.mjs");
  const bytes = crcFixture();
  assert.equal(verifyNsisIntegrity(bytes).headerOffset, 1024);
  bytes[700] = 1;
  assert.throws(() => verifyNsisIntegrity(bytes), /NSIS_CRC_MISMATCH/);
});

test("a disabled CRC check or truncated payload is rejected", async () => {
  const { verifyNsisIntegrity } = await import("./nsis-integrity.mjs");
  const bytes = crcFixture();
  assert.throws(
    () => verifyNsisIntegrity(bytes.subarray(0, -1)),
    /NSIS_INVALID_LENGTH/,
  );
  bytes.writeUInt32LE(5, 1024);
  assert.throws(() => verifyNsisIntegrity(bytes), /NSIS_CRC_DISABLED/);
});

test("default NSIS icons produce an uninstaller whose stored CRC matches its actual bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cw nsis integrity "));
  try {
    const generator = join(directory, "generator.exe");
    const uninstaller = join(directory, "uninstaller.exe");
    const script = join(directory, "fixture.nsi");
    await writeFile(
      script,
      [
        "Unicode true",
        `OutFile \"${generator}\"`,
        'Name "CRC fixture"',
        "RequestExecutionLevel user",
        "Section",
        'WriteUninstaller "$TEMP\\uninstaller.exe"',
        "SectionEnd",
        'Section "un.Uninstall"',
        'DetailPrint "fixture uninstaller"',
        "SectionEnd",
      ].join("\n"),
    );
    const compiler = await getMakeNsisPath();
    const built = spawnSync(compiler.path, ["-V1", script], {
      env: { ...process.env, ...compiler.env },
      encoding: "utf8",
    });
    assert.equal(built.status, 0, built.stdout + built.stderr);
    await UninstallerReader.exec(generator, uninstaller);
    const bytes = await readFile(uninstaller);
    assert.equal(
      crc32(bytes.subarray(512, -4)),
      bytes.readUInt32LE(bytes.length - 4),
      "the extracted uninstaller must pass the runtime CRC check",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
