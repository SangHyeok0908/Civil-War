import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

function installerName(version) {
  if (
    typeof version !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)
  ) {
    throw new Error("INVALID_RELEASE_MANIFEST");
  }
  return `Civil-War-Collector-Setup-${version}-x64.exe`;
}

async function describeFile(directory, name) {
  const path = join(directory, name);
  const info = await stat(path);
  if (!info.isFile()) throw new Error("INSTALLER_MISSING");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { name, bytes: info.size, sha256: hash.digest("hex") };
}

export async function writeReleaseManifest(
  directory,
  version,
  electronVersion,
) {
  const name = installerName(version);
  let file;
  try {
    file = await describeFile(directory, name);
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error("INSTALLER_MISSING", { cause: error });
    throw error;
  }
  const manifest = {
    version,
    electronVersion,
    platform: "win32",
    arch: "x64",
    files: [file],
  };
  await writeFile(
    join(directory, "release.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await writeFile(
    join(directory, "SHA256SUMS.txt"),
    `${file.sha256}  ${name}\n`,
  );
  return manifest;
}

export async function verifyRelease(directory) {
  const manifest = JSON.parse(
    await readFile(join(directory, "release.json"), "utf8"),
  );
  const name = installerName(manifest.version);
  if (
    manifest.platform !== "win32" ||
    manifest.arch !== "x64" ||
    typeof manifest.electronVersion !== "string" ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== 1 ||
    manifest.files[0].name !== name
  ) {
    throw new Error("INVALID_RELEASE_MANIFEST");
  }
  const expected = manifest.files[0];
  const actual = await describeFile(directory, name);
  if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) {
    throw new Error("CHECKSUM_MISMATCH");
  }
  const checksums = await readFile(join(directory, "SHA256SUMS.txt"), "utf8");
  if (checksums !== `${actual.sha256}  ${name}\n`)
    throw new Error("CHECKSUM_MISMATCH");
  return manifest;
}
