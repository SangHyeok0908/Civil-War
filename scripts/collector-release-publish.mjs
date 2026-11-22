import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyRelease } from "./collector-release.mjs";

const installGuide =
  "https://github.com/SangHyeok0908/Civil-War/blob/master/docs/runbooks/collector-install.md";

export function releaseTag(version) {
  return `collector-v${version}`;
}

export function releaseNotes({ version, commit, installer }) {
  return [
    `Civil War Collector ${version} Windows 설치 파일입니다.`,
    "",
    '주의: 이 설치 파일은 코드 서명이 되어 있지 않아 Windows가 "알 수 없는 게시자" 경고를 보여 줄 수 있습니다. 아래 SHA-256 값과 내려받은 파일이 같은지 확인한 뒤 설치하세요.',
    "",
    `설치 안내: ${installGuide}`,
    "",
    `- 커밋: ${commit}`,
    `- 설치 파일: ${installer.name}`,
    `- 설치 파일 SHA-256: ${installer.sha256}`,
    "",
  ].join("\n");
}

export function runGh(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export async function publishCollectorRelease({ directory, commit, gh }) {
  const manifest = await verifyRelease(directory);
  const file = manifest.files[0];
  const tag = releaseTag(manifest.version);

  const existing = await gh(["release", "view", tag]);
  if (existing.code === 0) return "exists";
  if (existing.stderr) console.error(existing.stderr.trim());

  const notesDirectory = await mkdtemp(join(tmpdir(), "cw-release-notes-"));
  try {
    const notesFile = join(notesDirectory, "notes.md");
    await writeFile(
      notesFile,
      releaseNotes({ version: manifest.version, commit, installer: file }),
    );
    const created = await gh([
      "release",
      "create",
      tag,
      join(directory, file.name),
      join(directory, "SHA256SUMS.txt"),
      join(directory, "release.json"),
      "--target",
      commit,
      "--title",
      `Civil War Collector ${manifest.version}`,
      "--notes-file",
      notesFile,
    ]);
    if (created.code !== 0) {
      if (created.stderr) console.error(created.stderr.trim());
      throw new Error("RELEASE_CREATE_FAILED");
    }
    return "created";
  } finally {
    await rm(notesDirectory, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const directory = process.argv[2];
  const commit = process.env.GITHUB_SHA;
  if (!directory || !commit) {
    console.error(
      "사용법: GITHUB_SHA=<커밋> node collector-release-publish.mjs <폴더>",
    );
    process.exit(1);
  }
  try {
    const result = await publishCollectorRelease({
      directory,
      commit,
      gh: runGh,
    });
    console.log(
      result === "created"
        ? "Release를 만들었습니다."
        : "이미 있는 Release라 건너뜁니다.",
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
