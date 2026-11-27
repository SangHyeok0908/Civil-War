import { expect, test } from "@playwright/test";
import type { Recommendation } from "../../apps/web/src/types";
import { state } from "./helpers";

test("team recommendation includes a member with only one inhouse game", async ({
  page,
  request,
}) => {
  const members = state().members;
  const sparse = members[10];
  const stats = await request.get("/api/members/" + sparse.id + "/stats");
  expect(stats.status()).toBe(200);
  expect((await stats.json()).stats.games).toBe(1);

  await page.goto("/teams");
  await expect(page.getByRole("checkbox")).toHaveCount(11);
  for (const member of [...members.slice(0, 9), sparse]) {
    await page.getByRole("checkbox", { name: member.displayName }).check();
  }
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/teams/recommend") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "팀 추천 받기" }).click();
  const reply = await response;
  expect(reply.status()).toBe(200);
  const result: Recommendation = await reply.json();
  expect(result.candidates).toHaveLength(3);
  for (const candidate of result.candidates) {
    expect(
      [...candidate.teamA, ...candidate.teamB].map((seat) => seat.memberId),
    ).toContain(sparse.id);
  }
  await expect(page.locator(".candidate")).toHaveCount(3);
  await expect(page.locator(".team-seat")).toHaveCount(30);
  expect(result.rankLookups).toHaveLength(10);
  expect(result.rankLookups.every((r) => r.source === "default")).toBe(true);
  await expect(
    page.getByText("솔로랭크 반영 · 10명 중 0명 최신 조회"),
  ).toBeVisible();
  await expect(page.getByText("조회 실패 · 기준값 50 사용")).toHaveCount(10);
  await page.screenshot({
    path: "docs/validation/assets/2026-11-25-teams-rank-lookups.png",
    fullPage: true,
  });
});
