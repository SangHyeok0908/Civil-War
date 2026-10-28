import { build } from "esbuild";
import { build as viteBuild } from "vite";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const release = process.argv.includes("--release");
const output = release ? "apps/collector/build/release" : "apps/collector/dist";
await rm(output, { recursive: true, force: true });
await build({
  entryPoints: ["apps/collector/src/main/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron"],
  define: { __CW_COLLECTOR_RELEASE__: release ? "true" : "false" },
  minifySyntax: release,
  outfile: `${output}/main.cjs`,
});
await build({
  entryPoints: ["apps/collector/src/preload/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron"],
  outfile: `${output}/preload.cjs`,
});
await viteBuild({ build: { outDir: resolve(output, "renderer") } });
