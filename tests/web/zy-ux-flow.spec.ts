import { test, expect } from "@playwright/test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { state, origin, admin, login } from "./helpers";
import { HttpServerApi } from "../../apps/collector/src/main/server-api";
import { Outbox } from "../../apps/collector/src/main/outbox";
import { Uploader } from "../../apps/collector/src/main/uploader";
import { normalizeMatch } from "../../packages/lcu/src/normalize-match";
import { ROLES } from "../../packages/contracts/src/index";
test("six members four guests promotion shared code rotation preserves queued requests", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const s = state(),
    api = new HttpServerApi(origin);
  const identity = (i: number) => ({
    puuid: s.members[i].puuid,
    riotId: s.members[i].riotId,
    source: "current_summoner" as const,
    observedAt: new Date().toISOString(),
  });
  const a = await api.enroll(s.collectorCode, identity(0)),
    b = await api.enroll(s.collectorCode, identity(1));
  const raw = JSON.parse(
    readFileSync("fixtures/lcu/candidates/h2-20261021/G1.json", "utf8"),
  );
  raw.gameId = "9000000000000000000191";
  raw.gameCreation = Date.parse("2026-10-28T08:00:00Z");
  for (let i = 6; i < 10; i++)
    raw.participantIdentities[i].player.puuid = "ux-guest-" + i;
  raw.participants[0].timeline = { lane: "TOP", role: "SOLO" };
  await api.observations(
    raw,
    Array.from({ length: 4 }, (_, n) => ({
      puuid: "ux-guest-" + (n + 6),
      riotId: "미래참가자" + (n + 6) + "#TEST",
      source: "current_lookup" as const,
      observedAt: new Date().toISOString(),
    })),
    a,
  );
  const match = normalizeMatch(raw),
    key = "KR:" + match.gameId;
  const dir = mkdtempSync(path.join(tmpdir(), "cw-ux-flow-"));
  let box = new Outbox(path.join(dir, "queue.sqlite"));
  try {
    const rawJson = JSON.stringify(raw).replace(
      "{",
      '{"precision":0.12345678901234567890123456789,',
    );
    box.enqueueCollected(
      {
        schemaVersion: 1,
        rawMatch: raw,
        rawJson,
        clientSubmissionId: "ux-ingest",
      },
      a,
      match,
    );
    let upload = new Uploader(box, api, async () => a);
    await upload.drainOutbox();
    const pending = await api.get(key, a);
    expect(pending.state).toBe("pending");
    expect(
      pending.roleSuggestions?.find((p) => p.puuid === a.puuid)?.role,
    ).toBe("TOP");
    const roles = Object.fromEntries(
      match.participants.map((p, i) => [p.puuid, ROLES[i % 5]]),
    );
    [roles[match.participants[0].puuid], roles[match.participants[1].puuid]] = [
      "JUNGLE",
      "TOP",
    ];
    box.enqueueConfirmation(
      key,
      { rolesByPuuid: roles, clientSubmissionId: "ux-confirm" },
      a,
    );
    await upload.drainOutbox();
    await expect
      .poll(async () => (await api.progress([key], a))[0].evaluation.status)
      .toBe("ready");
    const game = await (await request.get("/api/matches/" + key)).json();
    expect(
      game.participants.filter((p: any) => p.memberId === null),
    ).toHaveLength(4);
    expect(
      game.participants.filter((p: any) => p.displayName === "게스트"),
    ).toHaveLength(4);
    await login(page, request);
    await page
      .getByRole("button", { name: "참가자 추가", exact: true })
      .click();
    const form = page.locator(".editor form");
    await expect(form.getByRole("textbox")).toHaveCount(1);
    await expect(form.getByLabel("Riot ID", { exact: true })).toBeVisible();
    await expect(form.getByText("초기 실력", { exact: true })).toHaveCount(0);
    await expect(
      form.locator("fieldset").getByText("팀 추천 대상", { exact: true }),
    ).toHaveCount(0);
    await form.getByLabel("Riot ID", { exact: true }).fill("미래참가자6#TEST");
    const saved = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/admin/members") &&
        r.request().method() === "POST",
    );
    await form
      .getByRole("button", { name: "참가자 저장", exact: true })
      .click();
    const savedResponse = await saved;
    expect(savedResponse.status()).toBe(200);
    const promoted = await savedResponse.json();
    expect(promoted.puuid).toBeNull();
    await api.observations(
      raw,
      [
        {
          puuid: "ux-guest-6",
          riotId: "미래참가자6#TEST",
          source: "current_lookup",
          observedAt: new Date().toISOString(),
        },
      ],
      a,
    );
    await expect
      .poll(async () => {
        const r = await request.get("/api/rankings");
        if (r.status() !== 200) return 0;
        return (await r.json()).members.find(
          (row: any) => row.stats.memberId === promoted.id,
        )?.stats.games;
      })
      .toBe(1);
    await page.screenshot({
      path: "docs/validation/assets/2026-10-28-ux-ease-member.png",
      fullPage: true,
    });
    const nextRaw = structuredClone(raw);
    nextRaw.gameId = "9000000000000000000192";
    const nextMatch = normalizeMatch(nextRaw),
      nextKey = "KR:" + nextMatch.gameId;
    const queued = box.enqueueCollected(
      {
        schemaVersion: 1,
        rawMatch: nextRaw,
        rawJson: JSON.stringify(nextRaw),
        clientSubmissionId: "keep-ingest-id",
      },
      a,
      nextMatch,
    );
    box.enqueueConfirmation(
      nextKey,
      { rolesByPuuid: roles, clientSubmissionId: "keep-confirm-id" },
      a,
    );
    box.cache("draft:" + a.memberId + ":" + nextKey, { [a.puuid]: "JUNGLE" });
    const before = box.listOutbox().filter((j) => j.matchKey === nextKey);
    await page.getByRole("link", { name: "코드·인증" }).click();
    const rotated = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/admin/collector-code/rotate") &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "모임 코드 재발급", exact: true })
      .click();
    const freshCode = (await (await rotated).json()).code;
    await expect(page.locator("output")).toHaveText(freshCode);
    await expect(api.members(a)).rejects.toMatchObject({
      code: "AUTH_REVOKED",
    });
    await expect(api.members(b)).rejects.toMatchObject({
      code: "AUTH_REVOKED",
    });
    await upload.drainOutbox();
    expect(box.listOutbox().find((j) => j.id === queued.id)?.state).toBe(
      "needs_attention",
    );
    box.close();
    box = new Outbox(path.join(dir, "queue.sqlite"));
    const reconnected = await api.enroll(freshCode, identity(0));
    box.resumeVerified(reconnected);
    const after = box.listOutbox().filter((j) => j.matchKey === nextKey);
    expect(
      after.map((j) => [j.payload, j.memberId, j.puuid, j.credentialId]),
    ).toEqual(
      before.map((j) => [j.payload, j.memberId, j.puuid, j.credentialId]),
    );
    expect(box.cached("draft:" + a.memberId + ":" + nextKey)).toEqual({
      [a.puuid]: "JUNGLE",
    });
    upload = new Uploader(box, api, async () => reconnected);
    await upload.drainOutbox();
    expect((await api.get(nextKey, reconnected)).state).toBe("registered");
    await page
      .getByRole("button", { name: "모임 코드 삭제", exact: true })
      .click();
    await expect(
      page.getByText("발급된 코드 없음", { exact: true }),
    ).toBeVisible();
    await expect(api.members(reconnected)).rejects.toMatchObject({
      code: "AUTH_REVOKED",
    });
    expect(
      await (await admin(request, "/matches/" + key, undefined, "GET")).text(),
    ).toContain("0.12345678901234567890123456789");
  } finally {
    box.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
