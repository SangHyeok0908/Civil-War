import { build } from "esbuild";
import { build as viteBuild } from "vite";
await build({
  entryPoints: ["apps/collector/src/main/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron"],
  outfile: "apps/collector/dist/main.cjs",
});
await build({
  entryPoints: ["apps/collector/src/preload/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron"],
  outfile: "apps/collector/dist/preload.cjs",
});
await viteBuild();
