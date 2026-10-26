// Scoped UI fixtures only: network-state presentation, NOT real server correctness evidence.
import { test, expect } from "@playwright/test";
import { state } from "./helpers";
test("fixtureOnly loading empty error recalculating malformed200", async ({
  page,
}) => {
  let release: () => void = () => {};
  const delay = new Promise<void>((r) => (release = r));
  await page.route("**/api/rankings", async (route) => {
    await delay;
    await route.fulfill({ status: 202, json: { code: "RECALCULATING" } });
  });
  await page.goto("/rankings");
  await expect(page.getByText("기록을 불러오는 중입니다…")).toBeVisible();
  release();
  await expect(page.getByText("계산 중", { exact: true })).toBeVisible();
  await page.unroute("**/api/rankings");
  await page.route("**/api/rankings", (route) =>
    route.fulfill({ status: 500, json: { code: "INTERNAL_ERROR" } }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "요청을 처리하지 못했습니다.",
  );
  await page.unroute("**/api/rankings");
  await page.route("**/api/rankings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "broken",
    }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("INVALID_RESPONSE");
  await page.route("**/api/matches?*", (route) =>
    route.fulfill({ status: 200, json: { items: [], nextCursor: null } }),
  );
  await page.goto("/matches");
  await expect(page.getByText("아직 등록된 기록이 없습니다.")).toBeVisible();
});
test("fixtureOnly selectionCannotChangeDuringPendingRecommendation", async ({
  page,
}) => {
  let release: () => void = () => {};
  const delay = new Promise<void>((r) => (release = r));
  await page.route("**/api/teams/recommend", async (route) => {
    await delay;
    await route.fulfill({ status: 202, json: { code: "RECALCULATING" } });
  });
  await page.goto("/teams");
  const boxes = page.getByRole("checkbox");
  for (let i = 0; i < 10; i++) await boxes.nth(i).check();
  await page.getByRole("button", { name: "팀 추천 받기" }).click();
  await expect(boxes.first()).toBeDisabled();
  release();
  await expect(page.getByText("계산 중", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeEnabled();
});

test("fixtureOnly matchRecalculationRefreshesWithoutNavigation", async ({
  page,
  request,
}) => {
  const url = "/api/matches/" + state().keys[0];
  await expect
    .poll(async () => (await (await request.get(url)).json()).evaluationStatus)
    .toBe("ready");
  const ready = await (await request.get(url)).json();
  let calls = 0;
  await page.route("**/api/matches/*", (route) =>
    route.fulfill({
      status: 200,
      json:
        ++calls === 1
          ? {
              ...ready,
              evaluationStatus: "recalculating",
              generationId: null,
              scoringVersion: null,
              scores: [],
            }
          : ready,
    }),
  );
  await page.goto("/matches/" + state().keys[0]);
  await expect(
    page.getByText("계산 중 · 전적 수치는 확인할 수 있습니다."),
  ).toBeVisible();
  await expect(
    page.getByTestId("player-row").first().locator("summary"),
  ).toBeVisible();
  expect(calls).toBeGreaterThan(1);
});
