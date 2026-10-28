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
    path: "docs/validation/assets/2026-10-28-ux-ease-collector.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "내전 등록", exact: true }),
  ).toBeEnabled();
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
    path: "docs/validation/assets/2026-10-28-ux-ease-history.png",
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
    page.getByText("현재 롤 계정과 모임에 연결한 계정이 다릅니다."),
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
  await expect(page.locator("article.match")).toHaveCount(3);
  const dates = await page
    .locator("article.match > header h2")
    .allTextContents();
  expect(dates[0]).toContain("2026. 1. 6.");
  expect(dates[2]).toContain("2026. 1. 4.");
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
  await expect(page.locator("article.match")).toHaveCount(3);
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

test("observed server cancellation updates filter and never shows score ready", async () => {
  const page = await launch();
  await page
    .getByRole("button", { name: "롤에서 경기 가져오기", exact: true })
    .click();
  for (let i = 0; i < 10; i++)
    await page
      .getByRole("combobox")
      .nth(i)
      .selectOption(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][i % 5]);
  await page.getByRole("button", { name: "내전 등록", exact: true }).click();
  await expect(page.locator("article.match .badge")).toHaveText("등록 완료");
  await expect(page.getByText("점수·랭킹 계산 대기 중")).toBeVisible();
  await app.evaluate(() => {
    (globalThis as any).__collectorFixture.state = "canceled";
  });
  await expect(page.locator("article.match .badge")).toHaveText("등록 취소", {
    timeout: 12000,
  });
  await expect(
    page.getByText("점수·랭킹 반영 완료", { exact: true }),
  ).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "경기 상태별 보기" });
  await expect(nav.getByRole("button", { name: /등록 완료/ })).toContainText(
    "0",
  );
  await expect(nav.getByRole("button", { name: /등록 취소/ })).toContainText(
    "1",
  );
});

test("ease: registration click opens a position dialog without a checkbox", async () => {
  test.setTimeout(10000);
  const page = await launch();
  await page
    .getByRole("button", { name: "롤에서 경기 가져오기", exact: true })
    .click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  const register = page.getByRole("button", { name: "내전 등록", exact: true });
  await expect(register).toBeEnabled();
  await register.click();
  const dialog = page.getByRole("dialog", {
    name: "실제 포지션을 확정해주세요",
  });
  await expect(dialog).toBeVisible();
  expect(
    await app.evaluate(
      () => (globalThis as any).__collectorFixture.confirmCalls,
    ),
  ).toBe(0);
  await dialog.getByRole("button", { name: "확인", exact: true }).click();
  for (let i = 0; i < 10; i++)
    await page.getByRole("combobox").nth(i).selectOption("TOP");
  await register.click();
  await expect(dialog).toContainText("중복");
  await dialog.getByRole("button", { name: "확인", exact: true }).click();
  for (let i = 0; i < 10; i++)
    await page
      .getByRole("combobox")
      .nth(i)
      .selectOption(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][i % 5]);
  await register.click();
  await expect(page.locator("article.match .badge")).toHaveText("등록 완료");
});

test("ease: three games per page and drafts survive page and filter changes", async () => {
  test.setTimeout(10000);
  const page = await launch("filters");
  await expect(page.locator("article.match")).toHaveCount(3);
  const pages = page.getByRole("navigation", { name: "경기 페이지" });
  await expect(
    pages.getByRole("button", { name: "1페이지", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator("article.match > header").first()).toContainText(
    "2026. 1. 6.",
  );
  await expect(page.locator("article.match > header")).not.toContainText([
    "KR:",
    "KR:",
    "KR:",
  ]);
  await pages.getByRole("button", { name: "2페이지", exact: true }).click();
  const select = page
    .locator("article.match")
    .nth(1)
    .getByRole("combobox")
    .first();
  await select.selectOption("MIDDLE");
  await expect(select).toHaveValue("MIDDLE");
  await pages.getByRole("button", { name: "1페이지", exact: true }).click();
  await pages.getByRole("button", { name: "2페이지", exact: true }).click();
  await expect(
    page.locator("article.match").nth(1).getByRole("combobox").first(),
  ).toHaveValue("MIDDLE");
  const states = page.getByRole("navigation", { name: "경기 상태별 보기" });
  await states.getByRole("button", { name: /확인 대기/ }).click();
  await expect(page.locator("article.match")).toHaveCount(1);
  await states.getByRole("button", { name: /전체/ }).click();
  await expect(
    pages.getByRole("button", { name: "1페이지", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.screenshot({
    path: "docs/validation/assets/2026-10-28-ux-ease-pagination.png",
    fullPage: true,
  });
});

test("ease: connection dialog closes on success and dismissal does not reopen on polling", async () => {
  test.setTimeout(15000);
  const page = await launch("connection");
  const dialog = page.getByRole("dialog", { name: "모임에 연결" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "나중에", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.waitForTimeout(2400);
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "모임 코드 입력", exact: true })
    .click();
  await dialog.getByLabel("모임 코드", { exact: true }).fill("000007");
  await page.screenshot({
    path: "docs/validation/assets/2026-10-28-ux-ease-connection.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "모임에 연결", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("모임에 연결됨", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "모임 코드 입력", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("수집자 계정", { exact: true })).toBeVisible();
  await expect(
    page.getByText("내전한 경기를 등록해주세요", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "멈춘 전송 이어 보내기", exact: true }),
  ).toHaveCount(0);
});

test("ease: failed connection keeps its dialog and leading zero code until recovery", async () => {
  const page = await launch("connection");
  const dialog = page.getByRole("dialog", { name: "모임에 연결" });
  await expect(dialog).toBeVisible();
  await app.evaluate(() => {
    (globalThis as any).__collectorFixture.offline = true;
  });
  await dialog.getByLabel("모임 코드", { exact: true }).fill("000007");
  await dialog
    .getByRole("button", { name: "모임에 연결", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("모임 코드", { exact: true })).toHaveValue(
    "000007",
  );
  await app.evaluate(() => {
    (globalThis as any).__collectorFixture.offline = false;
  });
  await dialog
    .getByRole("button", { name: "모임에 연결", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(
    await app.evaluate(() => (globalThis as any).__collectorFixture.lastCode),
  ).toBe("000007");
});

test("ease: revoked connection asks once and reconnects without a resume control", async () => {
  const page = await launch("revoked");
  const dialog = page.getByRole("dialog", { name: "모임에 연결" });
  await expect(dialog).toContainText("저장된 기록은 유지됩니다");
  await dialog.getByRole("button", { name: "나중에", exact: true }).click();
  await page.waitForTimeout(2400);
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "모임 코드 입력", exact: true })
    .click();
  await dialog.getByLabel("모임 코드", { exact: true }).fill("000007");
  await dialog
    .getByRole("button", { name: "모임에 연결", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "롤에서 경기 가져오기", exact: true }),
  ).toBeEnabled();
});

test("ease: an existing long group code reconnects without forcing other devices to rotate", async () => {
  const page = await launch("connection");
  const dialog = page.getByRole("dialog", { name: "모임에 연결" });
  const legacy = "a".repeat(43);
  await dialog.getByLabel("모임 코드", { exact: true }).fill(legacy);
  await expect(dialog.getByLabel("모임 코드", { exact: true })).toHaveValue(
    legacy,
  );
  await expect(
    dialog.getByRole("button", { name: "모임에 연결", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "모임에 연결", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(
    await app.evaluate(() => (globalThis as any).__collectorFixture.lastCode),
  ).toBe(legacy);
});
