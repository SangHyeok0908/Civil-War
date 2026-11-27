import { expect, test } from "@playwright/test";
import { login, sql } from "./helpers";

test.beforeAll(() => {
  sql(
    "INSERT INTO member_profile_snapshots(member_id,riot_id,profile_icon_id,observed_at,next_attempt_at) SELECT id,riot_id,29,now(),now()+interval '1 day' FROM members ON CONFLICT(member_id) DO UPDATE SET riot_id=excluded.riot_id,profile_icon_id=29",
  );
});

test("history keeps member and champion filters and a quiet footer", async ({
  page,
}) => {
  await page.goto("/matches");
  await expect(
    page.getByRole("combobox", { name: "참가자", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "챔피언", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "포지션", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "승패", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("footer")).toHaveText("Civil War");
  await expect(
    page.locator(".match-card .asset.champion").first(),
  ).toBeVisible();
  await expect(page.locator(".match-card .member-avatar")).toHaveCount(0);
});

test("cached Riot portraits appear in members admin and team choices", async ({
  page,
  request,
}) => {
  await page.route("**/img/profileicon/*.png", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1b8AAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  // The previous spec cancels a match; recommending before that recalculation ends returns 202.
  await expect
    .poll(async () => (await request.get("/api/rankings")).status())
    .toBe(200);
  const members = await (await request.get("/api/members")).json();
  expect(members[0].profileIconId).toBe(29);
  expect(JSON.stringify(members)).not.toMatch(/puuid|riotId|token/);
  await page.goto("/members");
  await expect(page.locator(".member-avatar img")).toHaveCount(members.length);
  await expect(page.locator(".member-avatar img").first()).toHaveAttribute(
    "src",
    /\/profileicon\/29\.png$/,
  );
  await page.goto("/teams");
  await expect(page.locator(".selection-card .member-avatar img")).toHaveCount(
    members.filter((m: any) => m.active).length,
  );
  for (let i = 0; i < 10; i++) await page.getByRole("checkbox").nth(i).check();
  await page.getByRole("button", { name: "팀 추천 받기" }).click();
  await expect(page.locator(".team-seat .member-avatar img")).toHaveCount(30);
  await login(page, request);
  await expect(page.locator(".admin-members .member-avatar img")).toHaveCount(
    members.length,
  );
});

test("portrait host failure falls back without blocking selection", async ({
  page,
}) => {
  await page.route("**/img/profileicon/*.png", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.goto("/teams");
  await expect(page.locator(".member-avatar").first()).toContainText(/\S/);
  await expect(page.locator(".member-avatar img").first()).toHaveCount(0);
  await page.getByRole("checkbox").first().check();
  await expect(page.getByRole("checkbox").first()).toBeChecked();
});

test("page navigation returns to the new records and restores a clear focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/matches");
  await page.getByRole("button", { name: "다음 페이지", exact: true }).click();
  await expect(page.locator('.pagination [aria-current="page"]')).toHaveText(
    "2 페이지",
  );
  await expect(page.locator(".match-link").first()).toBeInViewport();
  await expect(
    page.getByRole("region", { name: "경기 기록", exact: true }),
  ).toBeFocused();
});

test("public member availability explains its effect on team selection", async ({
  page,
}) => {
  await page.goto("/members");
  await expect(page.locator(".member-card .badge").first()).toHaveText(
    "팀 추천 대상",
  );
});

test("long Riot IDs remain readable beside admin controls on a small screen", async ({
  page,
  request,
}) => {
  await login(page, request);
  await page.route("**/api/admin/members", async (route) => {
    const response = await route.fetch();
    const members = await response.json();
    members[0].displayName = "VeryLongGameName#KR123";
    members[0].riotId = "VeryLongGameName#KR123";
    await route.fulfill({ response, json: members });
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.reload();
  const identity = page.locator(".member-identity small").first();
  await expect(identity).toContainText("VeryLongGameName#KR123");
  expect(
    await identity.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page
    .locator(".admin-members .panel")
    .first()
    .getByRole("button", { name: "편집", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Riot ID", exact: true }),
  ).toBeVisible();
});
