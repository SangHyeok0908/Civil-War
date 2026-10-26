import { expect, test } from "@playwright/test";
import { state } from "./helpers";
test("confirmedObjectiveRulesDescribePerMinuteMetrics", async ({
  page,
  request,
}) => {
  await expect
    .poll(async () => (await request.get("/api/rankings")).status())
    .toBe(200);
  const ranking = await (await request.get("/api/rankings")).json();
  const rules = await (
    await request.get("/api/scoring-versions/" + ranking.scoringVersion)
  ).json();
  expect(rules.algorithmVersion).toBe("objective-position-v1");
  for (const path of [
    "/rankings",
    "/matches/" + state().keys[0],
    "/members/" + state().members[0].id,
  ]) {
    await page.goto(path);
    await page.locator(".rule-note summary").click();
    await expect(page.locator(".rule-note")).toContainText(
      "탑은 분당 포탑 피해",
    );
    await expect(page.locator(".rule-note")).toContainText(
      "정글·미드·원딜·서포터는 분당 목표물 피해",
    );
    await expect(page.locator(".rule-note")).toContainText(
      "두 피해량을 더하거나 섞지 않습니다",
    );
    await expect(page.locator(".rule-note")).not.toContainText("잠정 기준");
  }
  await page.goto("/rankings");
  await page.locator(".rule-note summary").click();
  await expect(page.locator(".rule-note caption")).toBeVisible();
  await page.locator(".rule-note").screenshot({
    path: "docs/validation/assets/confirmed-objective-rules.png",
  });
});
test("tenPlayerComparison and missingAssetFallback", async ({ page }) => {
  await page.route("https://ddragon.leagueoflegends.com/**", (r) =>
    r.fulfill({ status: 404, body: "" }),
  );
  await page.goto("/matches/" + state().keys[0]);
  await expect(page.getByRole("heading", { name: "경기 상세" })).toBeVisible();
  await expect(page.getByTestId("player-row")).toHaveCount(10);
  await expect(page.getByText(/KST/).first()).toBeVisible();
  await expect(page.getByText("999999").first()).toBeVisible();
  await expect(page.getByText("Perfect").first()).toBeVisible();
  await page.getByTestId("player-row").first().locator("summary").click();
  await expect(
    page.getByTestId("player-row").first().getByText("사망 보정"),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/validation/assets/stage3-match-desktop.png",
    fullPage: true,
  });
});
test("aggregateKdaFromTotals and provisionalVisible", async ({
  page,
  request,
}) => {
  const s = state();
  const result = await (
    await request.get("/api/members/" + s.members[1].id + "/stats")
  ).json();
  await page.goto("/members/" + s.members[1].id);
  const stats = result.stats;
  await expect(page.locator(".kda-summary")).toContainText(
    stats.kills + " / " + stats.deaths + " / " + stats.assists,
  );
  await expect(page.locator(".kda-summary")).toContainText(
    ((stats.kills + stats.assists) / stats.deaths).toFixed(2) + " KDA",
  );
  await page.goto("/rankings");
  await expect(page.getByText("평가 중")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "다온", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/validation/assets/stage3-rankings.png",
    fullPage: true,
  });
});
test("anonymousTeamChoices and keyboard selection", async ({ page }) => {
  await page.goto("/teams");
  await expect(page.getByRole("checkbox")).toHaveCount(11);
  const boxes = page.getByRole("checkbox");
  await boxes.first().focus();
  await page.keyboard.press("Space");
  for (let i = 1; i < 10; i++) await boxes.nth(i).check();
  await page.getByRole("button", { name: "팀 추천 받기" }).click();
  await expect(page.locator(".candidate")).toHaveCount(3);
  await expect(page.locator(".team-seat")).toHaveCount(30);
  await page.screenshot({
    path: "docs/validation/assets/stage3-teams.png",
    fullPage: true,
  });
});
test("paginationAndSameParticipantFilters", async ({ page, request }) => {
  await page.goto("/matches");
  await expect(page.locator(".match-card")).toHaveCount(10);
  const first = await page.locator(".match-link").first().getAttribute("href");
  await page.getByRole("button", { name: "다음 페이지" }).click();
  await expect(page.locator(".match-card")).toHaveCount(2);
  expect(
    await page.locator(".match-link").first().getAttribute("href"),
  ).not.toEqual(first);
  await page
    .getByRole("combobox", { name: "참가자", exact: true })
    .selectOption(state().members[10].id);
  await expect(page.locator(".match-card")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "포지션", exact: true })
    .selectOption("TOP");
  await expect(page.getByText("아직 등록된 기록이 없습니다.")).toBeVisible();
  const bad = await request.get("/api/no-such-route");
  expect(bad.status()).toBe(404);
  expect(bad.headers()["content-type"]).toContain("application/json");
});
test("mobileReadableTablesAndNavigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/matches/" + state().keys[0]);
  await expect(page.getByTestId("player-row")).toHaveCount(10);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".table-scroll")
      .first()
      .evaluate((e) => e.scrollWidth > e.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "docs/validation/assets/stage3-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "팀 추천", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "균형 있는 팀 추천" }),
  ).toBeVisible();
});
