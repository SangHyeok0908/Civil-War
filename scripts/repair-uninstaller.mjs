import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  readFile,
  lstat,
  mkdir,
  mkdtemp,
  cp,
  copyFile,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { verifyNsisIntegrity } from "./nsis-integrity.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function regular(path, directory = false) {
  const info = await lstat(path);
  if (
    info.isSymbolicLink() ||
    (directory ? !info.isDirectory() : !info.isFile())
  )
    throw new Error("UNSAFE_PATH");
}

export async function repairUninstaller({
  installDir,
  dataDir,
  backupRoot,
  replacement,
  expectedOriginalHash,
  expectedReplacementHash,
  checkIdle,
}) {
  await checkIdle();
  await regular(installDir, true);
  await regular(dataDir, true);
  const target = join(installDir, "Uninstall Civil War Collector.exe");
  await regular(target);
  await regular(replacement);
  const fixed = await readFile(replacement);
  if (sha256(fixed) !== expectedReplacementHash)
    throw new Error("REPAIR_PAYLOAD_MISMATCH");
  verifyNsisIntegrity(fixed);
  const original = await readFile(target);
  if (sha256(original) === expectedReplacementHash)
    return { status: "already-repaired" };
  if (sha256(original) !== expectedOriginalHash)
    throw new Error("UNEXPECTED_UNINSTALLER");

  await mkdir(backupRoot, { recursive: true });
  await regular(backupRoot, true);
  const backupDirectory = await mkdtemp(
    join(backupRoot, "uninstaller-repair-"),
  );
  await cp(dataDir, join(backupDirectory, "data"), {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
  const backupFile = join(backupDirectory, "original-uninstaller.exe");
  await copyFile(target, backupFile, constants.COPYFILE_EXCL);
  if (sha256(await readFile(backupFile)) !== expectedOriginalHash)
    throw new Error("BACKUP_MISMATCH");
  await checkIdle();
  await regular(target);
  if (sha256(await readFile(target)) !== expectedOriginalHash)
    throw new Error("UNINSTALLER_CHANGED");
  const temporary = target + ".repair-" + randomUUID();
  try {
    await writeFile(temporary, fixed, { flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  if (sha256(await readFile(target)) !== expectedReplacementHash)
    throw new Error("REPAIR_WRITE_FAILED");
  return { status: "repaired", backupDirectory };
}

async function main() {
  if (
    process.platform !== "win32" ||
    process.versions.node.split(".")[0] !== "24"
  )
    throw new Error("WINDOWS_NODE_24_REQUIRED");
  if (process.argv.length !== 3 || process.argv[2] !== "--repair")
    throw new Error("USE_NODE_REPAIR_UNINSTALLER_MJS_REPAIR");
  const directory = dirname(fileURLToPath(import.meta.url));
  const manifest = JSON.parse(
    await readFile(join(directory, "recovery.json"), "utf8"),
  );
  const knownOriginal =
    "b701ccbf919acf8691d6bbb870a3ce553e0c79204193f222825b50c9ab9dd5e2";
  if (
    manifest.originalSha256 !== knownOriginal ||
    !/^[a-f0-9]{64}$/.test(manifest.repairedSha256)
  )
    throw new Error("INVALID_RECOVERY_MANIFEST");
  const replacement = join(
    directory,
    "Uninstall-Civil-War-Collector-0.2.0-repaired.exe",
  );
  if (verifyNsisIntegrity(await readFile(replacement)).crc32 !== "12b43385")
    throw new Error("UNEXPECTED_ORIGINAL_CRC");
  if (
    !process.env.LOCALAPPDATA ||
    !process.env.APPDATA ||
    !process.env.SystemRoot
  )
    throw new Error("WINDOWS_PATHS_UNAVAILABLE");
  const result = await repairUninstaller({
    installDir: join(
      process.env.LOCALAPPDATA,
      "Programs",
      "Civil War Collector",
    ),
    dataDir: join(process.env.APPDATA, "Civil War Collector"),
    backupRoot: join(process.env.LOCALAPPDATA, "CivilWarAcceptanceBackups"),
    replacement,
    expectedOriginalHash: knownOriginal,
    expectedReplacementHash: manifest.repairedSha256,
    checkIdle: async () => {
      const listing = spawnSync(
        join(process.env.SystemRoot, "System32", "tasklist.exe"),
        ["/FI", "IMAGENAME eq Civil War Collector.exe", "/FO", "CSV", "/NH"],
        { encoding: "utf8", windowsHide: true },
      );
      if (listing.error || listing.status !== 0)
        throw new Error("PROCESS_CHECK_FAILED");
      if (
        listing.stdout
          .split(/\r?\n/)
          .some((line) => /^"Civil War Collector\.exe",/i.test(line))
      )
        throw new Error("COLLECTOR_RUNNING");
    },
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    const code = /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "REPAIR_IO_FAILED";
    process.stdout.write(JSON.stringify({ status: "stopped", code }) + "\n");
    process.exitCode = 1;
  });
}
