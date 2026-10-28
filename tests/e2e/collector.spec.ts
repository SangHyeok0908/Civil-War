import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
} from "@playwright/test";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
let app: ElectronApplication;
let dir: string;
test.afterEach(async () => {
  await app?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});
async function launch(mode = "normal") {
  dir = mkdtempSync(join(tmpdir(), "cw-ui-"));
  app = await electron.launch({
    args: ["apps/collector/dist/main.cjs"],
    env: {
      ...process.env,
      CW_COLLECTOR_FIXTURE: "1",
      CW_FIXTURE_MODE: mode,
      CW_FIXTURE_DATA: dir,
    },
  });
  return await app.firstWindow();
}
test("buttonFetchesAndStages; noAutoRegistration; allRolesConfirmed 5+5", async () => {
  const page = await launch();
  await expect(
    page.getByRole("heading", { name: "내전 수집기" }),
  ).toBeVisible();
  expect(
    await app.evaluate(
      () => (globalThis as any).__collectorFixture.historyCalls,
    ),
  ).toBe(0);
  await page
    .getByRole("button", { name: "과거 경기 조회", exact: true })
    .click();
  await expect(
    page.getByText("확인 대기", { exact: true }).first(),
  ).toBeVisible();
  expect(
    await app.evaluate(
      () => (globalThis as any).__collectorFixture.confirmCalls,
    ),
  ).toBe(0);
  const roles = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
  const selectors = page.getByRole("combobox");
  await expect(selectors).toHaveCount(10);
  for (let i = 0; i < 10; i++)
    await selectors.nth(i).selectOption(roles[i % 5]);
  mkdirSync("docs/validation/assets", { recursive: true });
  await page.screenshot({
    path: "docs/validation/assets/stage2-collector.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "내전 등록", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("모임 내전이며 양 팀의 실제 포지션을 확인했습니다")
    .check();
  await page.getByRole("button", { name: "내전 등록", exact: true }).click();
  await expect(
    page.getByText("등록 완료", { exact: true }).first(),
  ).toBeVisible();
  expect(
    await app.evaluate(
      () => (globalThis as any).__collectorFixture.confirmCalls,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(() => JSON.stringify(window.collector)),
  ).not.toContain("token");
  const exposed = await page.evaluate(async () =>
    JSON.stringify(await window.collector.snapshot()),
  );
  expect(exposed).not.toMatch(
    /fixture-main-only|credentialId|rawMatch|rawJson|"token"/,
  );
  const malformed = await page.evaluate(async () => {
    try {
      await window.collector.confirmRegistration("KR:1", {} as any, true);
      return "accepted";
    } catch (e) {
      return (e as Error).message;
    }
  });
  expect(malformed).toBe("INVALID_ROLES");
  expect(
    await page.evaluate(() => ({
      node: typeof (window as any).require,
      apiKeys: Object.keys(window.collector),
    })),
  ).toMatchObject({ node: "undefined" });
  const runtime = await app.evaluate(({ BrowserWindow }) => ({
    node: process.versions.node,
    electron: process.versions.electron,
    preferences: (
      BrowserWindow.getAllWindows()[0].webContents as any
    ).getLastWebPreferences(),
  }));
  expect(runtime.electron).toBe("45.0.0");
  expect(runtime.preferences).toMatchObject({
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
  });
});
test("offlineThenResume preserves explicit confirmation through restart", async () => {
  const page = await launch("offline");
  await page
    .getByRole("button", { name: "과거 경기 조회", exact: true })
    .click();
  await expect(
    page.getByText("전송 대기", { exact: true }).first(),
  ).toBeVisible();
  for (let i = 0; i < 10; i++)
    await page
      .getByRole("combobox")
      .nth(i)
      .selectOption(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][i % 5]);
  await page
    .getByLabel("모임 내전이며 양 팀의 실제 포지션을 확인했습니다")
    .check();
  await page.getByRole("button", { name: "내전 등록", exact: true }).click();
  await expect(
    page.getByText("등록 대기", { exact: true }).first(),
  ).toBeVisible();
  await app.close();
  app = await electron.launch({
    args: ["apps/collector/dist/main.cjs"],
    env: {
      ...process.env,
      CW_COLLECTOR_FIXTURE: "1",
      CW_FIXTURE_MODE: "normal",
      CW_FIXTURE_DATA: dir,
    },
  });
  const reopened = await app.firstWindow();
  await expect(
    reopened.getByText("등록 완료", { exact: true }).first(),
  ).toBeVisible({ timeout: 15000 });
  expect(
    await app.evaluate(() => (globalThis as any).__collectorFixture.sent),
  ).toEqual(["ingest", "confirm"]);
  expect(
    await app.evaluate(
      () => (globalThis as any).__collectorFixture.historyCalls,
    ),
  ).toBe(0);
});
test("queryFailureIsNotPending", async () => {
  const page = await launch("failure");
  await page
    .getByRole("button", { name: "과거 경기 조회", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("조회");
  await expect(page.getByRole("combobox")).toHaveCount(0);
});
test("repeated history keeps an offline match visible with an incomplete-history warning", async () => {
  const page = await launch("history-stalled");
  await page
    .getByRole("button", { name: "과거 경기 조회", exact: true })
    .click();

  await expect(page.getByRole("alert")).toContainText(
    "더 오래된 기록은 확인하지 못했습니다",
  );
  await expect(
    page.getByText("전송 대기", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(10);
  expect(
    await app.evaluate(
      () => (globalThis as any).__collectorFixture.confirmCalls,
    ),
  ).toBe(0);
  await page.screenshot({
    path: "docs/validation/assets/2026-10-28-history-pagination.png",
    fullPage: true,
  });
});
test("pending survives absent LCU history; duplicateShowsExistingState", async () => {
  const page = await launch("pending");
  await expect(
    page.getByText("확인 대기", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "과거 경기 조회", exact: true })
    .click();
  await expect(page.getByRole("combobox")).toHaveCount(10);
});
test("canceled cannot register", async () => {
  const page = await launch("canceled");
  await page
    .getByRole("button", { name: "과거 경기 조회", exact: true })
    .click();
  await expect(
    page.getByText("등록 취소", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "내전 등록", exact: true }),
  ).toHaveCount(0);
});
test("account mismatch disables collection", async () => {
  const page = await launch("mismatch");
  await expect(
    page.getByText("현재 롤 계정과 기기 등록 계정이 다릅니다."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "과거 경기 조회", exact: true }),
  ).toBeDisabled();
});
test("stopped client remains usable for saved pending review", async () => {
  const page = await launch("stopped");
  await expect(
    page.getByText("롤 클라이언트를 실행하고 로그인하세요."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "과거 경기 조회", exact: true }),
  ).toBeDisabled();
  expect(
    await app.evaluate(
      () => (globalThis as any).__collectorFixture.historyCalls,
    ),
  ).toBe(0);
});
