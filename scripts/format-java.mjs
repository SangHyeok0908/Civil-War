import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const task = process.argv[2];
if (!["spotlessApply", "spotlessCheck"].includes(task)) {
  throw new Error("Expected spotlessApply or spotlessCheck");
}

const isWindows = process.platform === "win32";
const command = isWindows ? "cmd.exe" : "./apps/server/gradlew";
const args = isWindows
  ? ["/d", "/c", `apps\\server\\gradlew.bat -p apps/server ${task}`]
  : ["-p", "apps/server", task];
const result = spawnSync(command, args, {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
}
process.exit(result.status ?? 1);
