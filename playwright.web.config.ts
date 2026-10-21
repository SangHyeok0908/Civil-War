import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/web",
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: { baseURL: "http://localhost:18080", trace: "retain-on-failure" },
  outputDir: "test-results/web",
  webServer: {
    command: "node scripts/web-test-server.mjs",
    url: "http://127.0.0.1:18081/ready",
    timeout: 120000,
    reuseExistingServer: !!process.env.CW_REUSE_WEB_FIXTURE,
  },
});
