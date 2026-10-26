import { test, expect } from "@playwright/test";
import { admin, headers, login, state } from "./helpers";
test("codeOnlyLogin csrf cookie restore and logout", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/admin/members")).status()).toBe(401);
  const forged = await request.post("/api/admin/codes", {
    headers: { ...headers(), "X-CSRF-Token": "wrong" },
    data: { scope: "admin" },
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
    path: "docs/validation/assets/stage3-admin.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(
    page.getByRole("heading", { name: "운영자 로그인" }),
  ).toBeVisible();
});
test("referenceDoesNotOverwriteManual soloNeverEntersRanking explicitApply", async ({
  page,
  request,
}) => {
  const member = state().members[0];
  await login(page, request);
  const panel = page.locator(".admin-members>.panel").filter({
    has: page.getByRole("heading", {
      name: member.displayName + " 활성",
      exact: true,
    }),
  });
  await panel.getByRole("button", { name: "편집", exact: true }).click();
  await panel.getByText("초기 포지션 참고 자료", { exact: true }).click();
  await panel
    .getByLabel("확인한 공식 API PUUID")
    .fill("browser-official-member-1");
  const samples = Array.from({ length: 20 }, (_, i) => ({
    puuid: member.puuid,
    source: "solo420",
    gameId: "browser-solo-" + i,
    playedAt: "2026-10-21T12:" + String(i).padStart(2, "0") + ":00Z",
    role: "JUNGLE",
    evidence: {
      officialPuuid: "browser-official-member-1",
      queueId: 420,
      teamPosition: "JUNGLE",
      durationSeconds: 1800,
      earlyEnded: false,
    },
  }));
  await panel.getByLabel("참고 표본 JSON").fill(JSON.stringify(samples));
  await panel
    .getByLabel("공식 계정과 이 참가자의 연결을 직접 확인했습니다")
    .check();
  const before = await (
    await admin(request, "/members/" + member.id, undefined, "GET")
  ).json();
  const rankBefore = await (await request.get("/api/rankings")).json();
  await panel.getByRole("button", { name: "참고 자료 가져오기" }).click();
  await expect(
    panel.getByText("참고 자료를 가져왔습니다. 참가자 설정은 유지됩니다."),
  ).toBeVisible();
  expect(
    await (
      await admin(request, "/members/" + member.id, undefined, "GET")
    ).json(),
  ).toEqual(before);
  expect(await (await request.get("/api/rankings")).json()).toEqual(rankBefore);
  await panel.getByRole("button", { name: "제안을 편집란에 적용" }).click();
  await expect(
    panel.getByRole("combobox", { name: "주 포지션", exact: true }),
  ).toHaveValue("JUNGLE");
  expect(
    (
      await (
        await admin(request, "/members/" + member.id, undefined, "GET")
      ).json()
    ).primaryRole,
  ).toBe("TOP");
  await panel.getByRole("button", { name: "참가자 저장" }).click();
  await expect
    .poll(
      async () =>
        (
          await (
            await admin(request, "/members/" + member.id, undefined, "GET")
          ).json()
        ).primaryRole,
    )
    .toBe("JUNGLE");
  await expect
    .poll(async () => (await request.get("/api/rankings")).status())
    .toBe(200);
});
test("newBrowserCode and collectorDeviceRevocation", async ({
  page,
  request,
  browser,
}) => {
  await login(page, request);
  await page.getByRole("link", { name: "코드·인증" }).click();
  await page
    .getByRole("combobox", { name: "코드 종류", exact: true })
    .selectOption("collector");
  await page
    .getByRole("combobox", { name: "연결할 참가자", exact: true })
    .selectOption(state().members[1].id);
  const issued = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/codes") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "코드 발급", exact: true }).click();
  const code = await (await issued).json();
  await expect(page.locator("output")).toContainText(code.code);
  const enrolled = await request.post("/api/collector/enroll", {
    data: { code: code.code, currentPuuid: state().members[1].puuid },
  });
  expect(enrolled.status()).toBe(200);
  const credential = await enrolled.json();
  await page.reload();
  const devices = page.locator(".credentials").filter({
    has: page.getByRole("heading", { name: "수집자 기기 인증", exact: true }),
  });
  await devices
    .getByRole("row")
    .filter({ hasText: credential.credentialId.slice(0, 12) })
    .getByRole("button", { name: "폐기" })
    .click();
  await expect
    .poll(async () =>
      (
        await request.get("/api/collector/members", {
          headers: { Authorization: "Bearer " + credential.token },
        })
      ).status(),
    )
    .toBe(401);
  await page
    .getByRole("combobox", { name: "코드 종류", exact: true })
    .selectOption("admin");
  const newIssued = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/codes") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "코드 발급", exact: true }).click();
  const next = await (await newIssued).json();
  const context = await browser.newContext();
  const newPage = await context.newPage();
  await newPage.goto("http://localhost:18080/admin");
  await newPage.getByLabel("운영자 등록 코드").fill(next.code);
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
  await page.getByLabel("새 버전 ID").fill("browser-v2");
  await page.getByLabel("탑 피해량 가중치").fill("21");
  await page.getByLabel("탑 성장 가중치").fill("24");
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
  expect(after.at(-1).normalization).toEqual(before[0].normalization);
  await expect
    .poll(async () => {
      const r = await request.get("/api/rankings");
      return r.status() === 200 ? (await r.json()).scoringVersion : "waiting";
    })
    .toBe("browser-v2");
  await page.getByRole("link", { name: "재계산 작업", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "재계산 작업", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "실패한 최신 작업 재시도" }).click();
  await expect(
    page.locator("tbody").getByText("완료", { exact: true }).first(),
  ).toBeVisible();
});
