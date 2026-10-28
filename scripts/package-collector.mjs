import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { writeReleaseManifest, verifyRelease } from "./collector-release.mjs";
import { verifyEmbeddedUninstaller } from "./nsis-integrity.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "dist/collector");
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--verify") {
  const result = await verifyRelease(output);
  await verifyEmbeddedUninstaller(join(output, result.files[0].name));
  console.log(`Verified: ${result.files[0].name}`);
} else if (args.length === 0) {
  const built = spawnSync(
    process.execPath,
    ["scripts/build-collector.mjs", "--release"],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  if (built.error) throw built.error;
  if (built.status !== 0) process.exit(built.status ?? 1);
  const rootPackage = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  const collectorPackage = JSON.parse(
    await readFile(join(root, "apps/collector/package.json"), "utf8"),
  );
  const config = JSON.parse(
    await readFile(join(root, "apps/collector/electron-builder.json"), "utf8"),
  );
  const { build } = await import("electron-builder");
  await build({
    projectDir: root,
    config: {
      ...config,
      electronVersion: rootPackage.devDependencies.electron,
    },
    win: ["nsis"],
    x64: true,
    publish: "never",
  });
  const installer = join(
    output,
    `Civil-War-Collector-Setup-${collectorPackage.version}-x64.exe`,
  );
  const uninstaller = await verifyEmbeddedUninstaller(installer);
  await writeFile(
    join(output, "nsis-integrity.json"),
    JSON.stringify(uninstaller, null, 2) + "\n",
  );
  await writeReleaseManifest(
    output,
    collectorPackage.version,
    rootPackage.devDependencies.electron,
  );
  const result = await verifyRelease(output);
  console.log(`Created and verified: ${join(output, result.files[0].name)}`);
} else {
  throw new Error("Usage: node scripts/package-collector.mjs [--verify]");
}
