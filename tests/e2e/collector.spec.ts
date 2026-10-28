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
    .getByRole("button", { name: "롤에서 경기 가져오기", exact: true })
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
    path: "docs/validation/assets/2026-10-28-ux-collector.png",
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
    .getByRole("button", { name: "롤에서 경기 가져오기", exact: true })
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
    page.getByText("등록 진행 중", { exact: true }).first(),
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
    .getByRole("button", { name: "롤에서 경기 가져오기", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("조회");
  await expect(page.getByRole("combobox")).toHaveCount(0);
});
test("repeated history keeps an offline match visible with an incomplete-history warning", async () => {
  const page = await launch("history-stalled");
  await page
    .getByRole("button", { name: "롤에서 경기 가져오기", exact: true })
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
    .getByRole("button", { name: "롤에서 경기 가져오기", exact: true })
    .click();
  await expect(page.getByRole("combobox")).toHaveCount(10);
});
test("canceled cannot register", async () => {
  const page = await launch("canceled");
  await page
    .getByRole("button", { name: "롤에서 경기 가져오기", exact: true })
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
    page.getByText("현재 롤 계정과 모임에 연결 계정이 다릅니다."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "롤에서 경기 가져오기", exact: true }),
  ).toBeDisabled();
});
test("stopped client remains usable for saved pending review", async () => {
  const page = await launch("stopped");
  await expect(
    page.getByText("롤 클라이언트를 실행하고 로그인하세요."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "롤에서 경기 가져오기", exact: true }),
  ).toBeDisabled();
  expect(
    await app.evaluate(
      () => (globalThis as any).__collectorFixture.historyCalls,
    ),
  ).toBe(0);
});
test("champion compact rows and Portrait fallback keep confirmation usable", async () => {
  const page = await launch("champion");
  await page
    .getByRole("button", { name: "롤에서 경기 가져오기", exact: true })
    .click();
  await expect(page.getByText("베인", { exact: true }).first()).toBeVisible();
  const portraits = page.locator("img.champion-portrait");
  await expect(portraits).toHaveCount(10);
  await expect(portraits.first()).toHaveJSProperty("naturalWidth", 128);
  await portraits
    .first()
    .evaluate((img) => img.dispatchEvent(new Event("error")));
  await expect(page.getByText("베인", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("기록 보기", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(10);
  await expect(
    page.getByRole("button", { name: "내전 등록", exact: true }),
  ).toBeVisible();
});

test("filters show only selected state and moved game notice", async () => {
  const page = await launch();
  await page
    .getByRole("button", { name: "롤에서 경기 가져오기", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "경기 상태별 보기" });
  await expect(nav.getByRole("button", { name: /전체/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await nav.getByRole("button", { name: /등록 완료/ }).click();
  await expect(page.locator("article.match")).toHaveCount(0);
  await expect(page.getByText("등록 완료 경기가 없습니다.")).toBeVisible();
  await nav.getByRole("button", { name: /확인 대기/ }).click();
  await expect(page.locator("article.match")).toHaveCount(1);
  for (let i = 0; i < 10; i++)
    await page
      .getByRole("combobox")
      .nth(i)
      .selectOption(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][i % 5]);
  await page
    .getByLabel("모임 내전이며 양 팀의 실제 포지션을 확인했습니다")
    .check();
  await page.getByRole("button", { name: "내전 등록", exact: true }).click();
  await expect(page.locator("article.match")).toHaveCount(0);
  await expect(
    page.getByText("경기가 등록 완료 목록으로 이동했습니다."),
  ).toBeVisible();
  await nav.getByRole("button", { name: /전체/ }).click();
  await expect(page.locator("article.match")).toHaveCount(1);
  await expect(page.getByText("점수·랭킹 계산 대기 중")).toBeVisible();
});

test("all seven filters have correct counts and time order", async () => {
  const page = await launch("filters");
  const nav = page.getByRole("navigation", { name: "경기 상태별 보기" });
  await expect(page.locator("article.match")).toHaveCount(6);
  expect(
    await page.locator("article.match > header small").allTextContents(),
  ).toEqual(["KR:815", "KR:814", "KR:813", "KR:812", "KR:811", "KR:810"]);
  for (const label of [
    "전송 대기",
    "확인 대기",
    "등록 진행 중",
    "등록 완료",
    "등록 취소",
    "문제 해결 필요",
  ]) {
    const button = nav.getByRole("button", {
      name: new RegExp("^" + label + "\\s+1$"),
    });
    await button.click();
    await expect(page.locator("article.match")).toHaveCount(1);
    await expect(page.locator("article.match .badge")).toHaveText(label);
  }
  await nav.getByRole("button", { name: /전체/ }).click();
  await expect(page.locator("article.match")).toHaveCount(6);
});
test("role hints guests and manual draft survive refresh and restart", async () => {
  const page = await launch("hints-guests");
  await page
    .getByRole("button", { name: "롤에서 경기 가져오기", exact: true })
    .click();
  await expect(page.getByRole("combobox").nth(0)).toHaveValue("TOP");
  await expect(page.getByRole("combobox").nth(3)).toHaveValue("");
  await expect(page.getByText("게스트", { exact: true })).toHaveCount(4);
  await page.getByRole("combobox").nth(0).selectOption("MIDDLE");
  await page
    .getByRole("button", { name: "확인할 경기 불러오기", exact: true })
    .click();
  await expect(page.getByRole("combobox").nth(0)).toHaveValue("MIDDLE");
  await app.close();
  app = await electron.launch({
    args: ["apps/collector/dist/main.cjs"],
    env: {
      ...process.env,
      CW_COLLECTOR_FIXTURE: "1",
      CW_FIXTURE_MODE: "hints-guests",
      CW_FIXTURE_DATA: dir,
    },
  });
  const reopened = await app.firstWindow();
  await expect(reopened.getByRole("combobox").nth(0)).toHaveValue("MIDDLE");
  await reopened.getByRole("combobox").nth(0).selectOption("");
  await expect(reopened.getByRole("combobox").nth(0)).toHaveValue("");
});
