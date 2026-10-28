import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { writeReleaseManifest, verifyRelease } from "./collector-release.mjs";

const name = "Civil-War-Collector-Setup-0.2.0-provisional-x64.exe";
const sha256 =
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

test("설치용 빌드에는 개발용 경기 응답과 시험 서비스가 들어가지 않는다", async () => {
  const built = spawnSync(
    process.execPath,
    ["scripts/build-collector.mjs", "--release"],
    {
      encoding: "utf8",
    },
  );
  assert.equal(built.status, 0, built.stderr);
  const path = "apps/collector/build/release/main.cjs";
  assert.ok(existsSync(path), "설치 전용 빌드 결과가 없다");
  const main = await readFile(path, "utf8");
  assert.doesNotMatch(
    main,
    /fixture-player-01|fixture-main-only|fixtureService/,
  );
  assert.match(main, /node:sqlite/);
  assert.ok(existsSync("apps/collector/build/release/preload.cjs"));
  assert.ok(existsSync("apps/collector/build/release/renderer/index.html"));
});

async function withRelease(run) {
  const directory = await mkdtemp(join(tmpdir(), "cw release "));
  try {
    await writeFile(join(directory, name), "abc");
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("배포 실행 파일의 실제 크기와 SHA-256을 기록하고 다시 검증한다", async () => {
  await withRelease(async (directory) => {
    const manifest = await writeReleaseManifest(
      directory,
      "0.2.0-provisional",
      "45.0.0",
    );
    assert.deepEqual(manifest, {
      version: "0.2.0-provisional",
      electronVersion: "45.0.0",
      platform: "win32",
      arch: "x64",
      files: [{ name, bytes: 3, sha256 }],
    });
    assert.equal(
      await readFile(join(directory, "SHA256SUMS.txt"), "utf8"),
      `${sha256}  ${name}\n`,
    );
    assert.deepEqual(await verifyRelease(directory), manifest);
  });
});

test("배포 이후 실행 파일이 바뀌거나 빠지면 검증을 실패시킨다", async () => {
  await withRelease(async (directory) => {
    await writeReleaseManifest(directory, "0.2.0-provisional", "45.0.0");
    await writeFile(join(directory, name), "abd");
    await assert.rejects(verifyRelease(directory), /CHECKSUM_MISMATCH/);
    await rm(join(directory, name));
    await assert.rejects(verifyRelease(directory), /ENOENT/);
  });
});

test("해당 버전의 설치 실행 파일이 없으면 배포 목록을 만들지 않는다", async () => {
  await withRelease(async (directory) => {
    await assert.rejects(
      writeReleaseManifest(directory, "0.3.0", "45.0.0"),
      /INSTALLER_MISSING/,
    );
  });
});

test("배포 목록이 다른 폴더의 파일을 가리키면 읽기 전에 거절한다", async () => {
  await withRelease(async (directory) => {
    await writeFile(
      join(directory, "release.json"),
      JSON.stringify({
        version: "0.2.0-provisional",
        electronVersion: "45.0.0",
        platform: "win32",
        arch: "x64",
        files: [{ name: "../credential.bin", bytes: 3, sha256 }],
      }),
    );
    await assert.rejects(verifyRelease(directory), /INVALID_RELEASE_MANIFEST/);
  });
});
