import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeReleaseManifest } from "./collector-release.mjs";
import {
  releaseTag,
  releaseNotes,
  publishCollectorRelease,
} from "./collector-release-publish.mjs";

const version = "0.5.0-provisional";
const installer = `Civil-War-Collector-Setup-${version}-x64.exe`;
const commit = "0123456789abcdef0123456789abcdef01234567";
const guide =
  "https://github.com/SangHyeok0908/Civil-War/blob/master/docs/runbooks/collector-install.md";

async function makeDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "cw-release-publish-"));
  await writeFile(join(directory, installer), "fake installer bytes");
  await writeReleaseManifest(directory, version, "40.0.0");
  return directory;
}

function fakeGh(results) {
  const calls = [];
  const gh = async (args) => {
    calls.push(args);
    const key = args.slice(0, 2).join(" ");
    return { code: results[key] ?? 0, stdout: "", stderr: "" };
  };
  return { gh, calls };
}

test("릴리스 태그는 collector-v<버전>이다", () => {
  assert.equal(releaseTag(version), "collector-v0.5.0-provisional");
});

test("릴리스 노트에 커밋·SHA-256·코드 서명 경고·설치 안내 링크가 있다", () => {
  const sha256 = "ab".repeat(32);
  const notes = releaseNotes({
    version,
    commit,
    installer: { name: installer, sha256 },
  });
  assert.ok(notes.includes(commit));
  assert.ok(notes.includes(sha256));
  assert.ok(notes.includes("코드 서명"));
  assert.ok(notes.includes(guide));
});

test("publishCollectorRelease — 이미 있으면 만들지 않는다", async () => {
  const directory = await makeDirectory();
  try {
    const { gh, calls } = fakeGh({ "release view": 0 });
    assert.equal(
      await publishCollectorRelease({ directory, commit, gh }),
      "exists",
    );
    assert.deepEqual(calls, [["release", "view", "collector-v" + version]]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("publishCollectorRelease — 새 버전이면 세 파일로 만든다", async () => {
  const directory = await makeDirectory();
  try {
    const { gh, calls } = fakeGh({ "release view": 1, "release create": 0 });
    let notesPath;
    let notesBody;
    const wrapped = async (args) => {
      if (args[1] === "create") {
        notesPath = args[args.length - 1];
        notesBody = await readFile(notesPath, "utf8");
      }
      return gh(args);
    };
    assert.equal(
      await publishCollectorRelease({ directory, commit, gh: wrapped }),
      "created",
    );
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1], [
      "release",
      "create",
      "collector-v" + version,
      join(directory, installer),
      join(directory, "SHA256SUMS.txt"),
      join(directory, "release.json"),
      "--target",
      commit,
      "--title",
      "Civil War Collector " + version,
      "--notes-file",
      notesPath,
    ]);
    assert.ok(!calls[1].includes("--prerelease"));
    assert.ok(notesBody.includes(commit));
    await assert.rejects(readFile(notesPath), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("publishCollectorRelease — 파일이 변조되면 gh를 부르지 않는다", async () => {
  const directory = await makeDirectory();
  try {
    await writeFile(join(directory, installer), "fake installer byteX");
    const { gh, calls } = fakeGh({});
    await assert.rejects(publishCollectorRelease({ directory, commit, gh }), {
      message: "CHECKSUM_MISMATCH",
    });
    assert.equal(calls.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("publishCollectorRelease — 생성 실패", async () => {
  const directory = await makeDirectory();
  try {
    const { gh } = fakeGh({ "release view": 1, "release create": 1 });
    await assert.rejects(publishCollectorRelease({ directory, commit, gh }), {
      message: "RELEASE_CREATE_FAILED",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
