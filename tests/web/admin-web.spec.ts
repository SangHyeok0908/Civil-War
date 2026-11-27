import { test, expect } from "@playwright/test";
import { admin, headers, login, state } from "./helpers";
test("codeOnlyLogin csrf cookie restore and logout", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/admin/members")).status()).toBe(401);
  const forged = await request.post("/api/admin/collector-code", {
    headers: { ...headers(), "X-CSRF-Token": "wrong" },
    data: {},
  });
  expect(forged.status()).toBe(403);
  await login(page, request);
  await expect(page.getByRole("heading", { name: "운영 관리" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "운영 관리" })).toBeVisible();
  const cookies = await page.context().cookies();
  const cookie = cookies.find((c) => c.name === "cw-admin-dev");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  await page.screenshot({
    path: "docs/validation/assets/2026-10-28-ux-ease-admin.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(
    page.getByRole("heading", { name: "운영자 로그인" }),
  ).toBeVisible();
});
test("member editor no longer offers role references", async ({
  page,
  request,
}) => {
  const member = state().members[0];
  await login(page, request);
  const panel = page.locator(".admin-members>.panel").filter({
    has: page.getByRole("heading", {
      name: member.displayName,
      exact: true,
    }),
  });
  // An active member is the normal case, so only excluded members carry a badge.
  await expect(panel.locator(".badge")).toHaveCount(0);
  await panel.getByRole("button", { name: "편집", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "참가자 저장" }),
  ).toBeVisible();
  await expect(panel.getByText("초기 포지션 참고 자료")).toHaveCount(0);
  await expect(panel.getByPlaceholder("게임 이름#태그")).toBeVisible();
  await panel.getByLabel("주 포지션").selectOption("JUNGLE");
  await panel.getByLabel("부 포지션").selectOption("JUNGLE");
  await expect(
    panel.getByText("주 포지션과 부 포지션은 서로 달라야 합니다."),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "참가자 저장" }),
  ).toBeDisabled();
  await panel.getByLabel("부 포지션").selectOption(member.secondaryRole!);
  await panel.getByLabel("주 포지션").selectOption(member.primaryRole!);
  await panel.getByRole("button", { name: "참가자 저장" }).click();
  await expect(
    page.getByText(member.displayName + " 님의 정보를 저장했습니다."),
  ).toBeVisible();
});
test("fixedCodeNewBrowser and collectorDeviceRevocation", async ({
  page,
  request,
  browser,
}) => {
  await login(page, request);
  await page.getByRole("link", { name: "코드·인증" }).click();
  await expect(page.getByText("사용 중", { exact: true })).toBeVisible();
  const code = { code: state().collectorCode };
  const member = state().members[1];
  const enrolled = await request.post("/api/collector/enroll", {
    headers: { "X-CW-Collector-Protocol": "2" },
    data: {
      code: code.code,
      protocolVersion: 2,
      currentAccount: {
        puuid: member.puuid,
        riotId: member.riotId,
        source: "current_summoner",
        observedAt: new Date().toISOString(),
      },
    },
  });
  expect(enrolled.status()).toBe(200);
  const credential = await enrolled.json();
  await page.reload();
  const devices = page.locator(".credentials").filter({
    has: page.getByRole("heading", { name: "수집자 기기 인증", exact: true }),
  });
  const device = devices.locator(
    `[data-credential-id="${credential.credentialId}"]`,
  );
  await expect(device).toContainText(member.displayName);
  await device.getByRole("button", { name: "폐기", exact: true }).click();
  await expect(
    device.getByText("이 수집기는 모임 코드를 다시 입력해야 합니다."),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/validation/assets/2026-11-27-operator-ux-codes.png",
    fullPage: true,
  });
  await device.getByRole("button", { name: "폐기 확정" }).click();
  await expect
    .poll(async () =>
      (
        await request.get("/api/collector/members", {
          headers: {
            "X-CW-Collector-Protocol": "2",
            Authorization: "Bearer " + credential.token,
          },
        })
      ).status(),
    )
    .toBe(401);
  await expect(
    page.getByRole("button", { name: "운영자 코드 발급", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "운영자 발급 코드", exact: true }),
  ).toHaveCount(0);
  const removed = await admin(request, "/sessions", undefined, "GET");
  expect(removed.status()).toBe(200);
  // The browser in use is marked so the operator does not revoke it by mistake.
  const browsers = page.locator(".credentials").filter({
    has: page.getByRole("heading", {
      name: "운영자 브라우저 인증",
      exact: true,
    }),
  });
  await expect(
    browsers.getByText("현재 브라우저", { exact: true }),
  ).toHaveCount(1);
  await expect(
    browsers.getByRole("columnheader", { name: "마지막 사용" }),
  ).toBeVisible();
  const context = await browser.newContext();
  const newPage = await context.newPage();
  await newPage.goto("http://localhost:18080/admin");
  await newPage.getByLabel("운영자 로그인 코드").fill(state().adminCode);
  await newPage.getByRole("button", { name: "운영자 인증" }).click();
  await expect(
    newPage.getByRole("heading", { name: "운영 관리" }),
  ).toBeVisible();
  await context.close();
});
test("weightsCreateNewVersion immutableFullRules and jobs", async ({
  page,
  request,
}) => {
  const before = await (
    await admin(request, "/scoring-versions", undefined, "GET")
  ).json();
  await login(page, request);
  await page.getByRole("link", { name: "평가 기준", exact: true }).click();
  const save = page.getByRole("button", {
    name: "새 기준 저장 및 전체 재계산",
  });
  await expect(page.getByLabel("새 버전 이름")).toHaveValue(/^v\d{8}$/);
  await expect(page.getByText("항목 내부 비율과 고정 표준화 상수")).toHaveCount(
    0,
  );
  await page.getByLabel("새 버전 이름").fill("browser-v2");
  await page.getByLabel("탑 피해량 가중치").fill("21");
  // One changed weight breaks the total, which blocks saving until it is 100 again.
  await expect(page.getByText(/탑의 합계가 .+입니다/)).toBeVisible();
  await expect(save).toBeDisabled();
  await page.screenshot({
    path: "docs/validation/assets/2026-11-27-operator-ux-scoring.png",
    fullPage: true,
  });
  await page.getByLabel("탑 성장 가중치").fill("24");
  await expect(page.getByText(/탑의 합계가/)).toHaveCount(0);
  await expect(save).toBeEnabled();
  await page
    .getByRole("button", { name: "새 기준 저장 및 전체 재계산" })
    .click();
  await expect(
    page.getByText("새 평가 기준을 저장했습니다. 전체 기록을 다시 계산합니다."),
  ).toBeVisible();
  const after = await (
    await admin(request, "/scoring-versions", undefined, "GET")
  ).json();
  expect(after[0]).toEqual(before[0]);
  expect(after.at(-1).algorithmVersion).toBe("objective-position-v1");
  expect(after.at(-1).normalization).toEqual(before[0].normalization);
  await expect
    .poll(async () => {
      const r = await request.get("/api/rankings");
      return r.status() === 200 ? (await r.json()).scoringVersion : "waiting";
    })
    .toBe("browser-v2");
  const rejected = await request.post("/api/admin/scoring-versions", {
    headers: headers(),
    data: {
      ...after.at(-1),
      id: "legacy-rejected",
      algorithmVersion: "objective-provisional-v1",
    },
  });
  expect(rejected.status()).toBe(422);
  expect((await rejected.json()).code).toBe("INVALID_SCORING_RULES");
  const history = page.locator("details.rule-note").filter({
    has: page.locator("summary", { hasText: "browser-v2" }),
  });
  await expect(history.locator("summary")).toContainText("최신");
  await history.locator("summary").click();
  await expect(history.locator("caption")).toHaveText("포지션별 가중치 (%)");
  await expect(history.locator("pre")).toHaveCount(0);
  await page.getByRole("link", { name: "점수 재계산", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "점수 재계산 현황", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("점수가 최신 상태입니다")).toBeVisible();
  // Retrying is only offered after a failure; the endpoint itself stays harmless when idle.
  await expect(page.getByRole("button", { name: "다시 계산" })).toHaveCount(0);
  expect((await admin(request, "/recalculation/retry")).status()).toBe(200);
  await expect(
    page.locator("tbody").getByText("완료", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/validation/assets/2026-11-27-operator-ux-jobs.png",
    fullPage: true,
  });
});
test("auditLog names actions and targets in plain words", async ({
  page,
  request,
}) => {
  await login(page, request);
  await page.getByRole("link", { name: "변경 이력", exact: true }).click();
  const table = page.locator("table.audit");
  await expect(table.getByText("운영자 로그인").first()).toBeVisible();
  await expect(
    table.getByText("경기 등록", { exact: true }).first(),
  ).toBeVisible();
  await expect(table.getByText(/KST 경기$/).first()).toBeVisible();
  await expect(table.getByText("운영자 브라우저").first()).toBeVisible();
  // Raw action names, raw match keys and empty detail blocks are no longer shown.
  await expect(table.getByText(/admin_login|match_registered/)).toHaveCount(0);
  await expect(table.getByText(/KR:\d+/)).toHaveCount(0);
  await expect(table.getByText("{}")).toHaveCount(0);
  await expect(table.locator("pre")).toHaveCount(0);
  await page.screenshot({
    path: "docs/validation/assets/2026-11-27-operator-ux-audit.png",
    fullPage: true,
  });
});
test("matchCorrection keeps the position selector in view on a phone", async ({
  page,
  request,
}) => {
  await login(page, request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "경기 정정", exact: true }).click();
  const card = page.locator(".correction-card").first();
  await card.getByRole("button").first().click();
  await expect(card.locator(".correction-team")).toHaveCount(2);
  // The selector is the one control on this screen, so it must not hide behind a sideways scroll.
  expect(
    await card
      .locator(".correction-team .table-scroll")
      .first()
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/validation/assets/2026-11-27-operator-ux-correction-mobile.png",
    fullPage: false,
  });
});
