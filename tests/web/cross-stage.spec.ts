import { test, expect } from "@playwright/test";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HttpServerApi } from "../../apps/collector/src/main/server-api";
import { Outbox } from "../../apps/collector/src/main/outbox";
import { Uploader } from "../../apps/collector/src/main/uploader";
import { normalizeMatch } from "../../packages/lcu/src/normalize-match";
import { ROLES } from "../../packages/contracts/src";
import { state, admin, login, origin, headers } from "./helpers";
test("actualStage2OutboxToSpring pending lostConfirmAck roleCorrection cancellation precision", async ({
  page,
  request,
}) => {
  const s = state();
  let lose = true;
  const transport: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (String(input).endsWith("/confirm") && lose) {
      lose = false;
      throw new TypeError("simulated lost acknowledgment");
    }
    return response;
  };
  const api = new HttpServerApi(origin, transport);
  const credential = await api.enroll(s.collectorCode, s.members[0].puuid);
  const source = JSON.parse(
    readFileSync("fixtures/lcu/candidates/h2-20261021/G1.json", "utf8"),
  );
  source.gameId = "9000000000000000000099";
  source.gameCreation = Date.parse("2026-10-21T15:00:00Z");
  const rawJson = JSON.stringify(source).replace(
    "{",
    '{"preciseExtra":0.12345678901234567890123456789,',
  );
  const normalized = normalizeMatch(source);
  const key = "KR:" + source.gameId;
  const file = path.join(
    mkdtempSync(path.join(tmpdir(), "cw-stage3-outbox-")),
    "outbox.sqlite",
  );
  let box = new Outbox(file);
  let now = Date.now();
  let uploader = new Uploader(
    box,
    api,
    () => Promise.resolve(credential),
    () => now,
    () => 0,
  );
  box.enqueueCollected(
    {
      schemaVersion: 1,
      rawMatch: source,
      rawJson,
      clientSubmissionId: "cross-stage-ingest",
    },
    credential,
    normalized,
  );
  await uploader.drainOutbox();
  expect((await api.get(key, credential)).state).toBe("pending");
  expect((await request.get("/api/matches/" + key)).status()).toBe(404);
  const rolesByPuuid = Object.fromEntries(
    normalized.participants.map((p, i) => [p.puuid, ROLES[i % 5]]),
  );
  box.enqueueConfirmation(
    key,
    { rolesByPuuid, clientSubmissionId: "cross-stage-confirm" },
    credential,
  );
  await uploader.drainOutbox();
  expect((await api.get(key, credential)).state).toBe("registered");
  expect(box.listOutbox().find((r) => r.kind === "confirm")?.state).toBe(
    "pending",
  );
  box.close();
  box = new Outbox(file);
  now += 1000000;
  uploader = new Uploader(
    box,
    api,
    () => Promise.resolve(credential),
    () => now,
    () => 0,
  );
  await uploader.drainOutbox();
  expect(box.listOutbox().every((r) => r.state === "succeeded")).toBe(true);
  box.close();
  const privateRecord = await admin(
    request,
    "/matches/" + key,
    undefined,
    "GET",
  );
  expect(await privateRecord.text()).toContain(
    "0.12345678901234567890123456789",
  );
  await expect
    .poll(async () => {
      const r = await request.get("/api/matches/" + key);
      return (await r.json()).evaluationStatus;
    })
    .toBe("ready");
  await login(page, request);
  await page.getByRole("link", { name: "경기 정정", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(key) }).click();
  await page.getByText("원본 수치 보기 (읽기 전용)", { exact: true }).click();
  await expect(page.locator(".raw-record")).toContainText(
    "0.12345678901234567890123456789",
  );
  await page
    .getByLabel("여울 실제 포지션", { exact: true })
    .selectOption("JUNGLE");
  await page
    .getByLabel("바람 실제 포지션", { exact: true })
    .selectOption("TOP");
  await page.getByRole("button", { name: "포지션 정정 저장" }).click();
  await expect(
    page.getByText("포지션을 정정했습니다. 평가를 다시 계산합니다."),
  ).toBeVisible();
  expect(
    (await (await admin(request, "/matches/" + key, undefined, "GET")).json())
      .record.confirmedRoles[s.members[0].puuid],
  ).toBe("JUNGLE");
  await page.getByRole("button", { name: "등록 취소", exact: true }).click();
  await page.getByRole("button", { name: "등록 취소 확정" }).click();
  await expect(page.getByText("등록을 취소했습니다.")).toBeVisible();
  expect((await request.get("/api/matches/" + key)).status()).toBe(404);
  const retained = await (
    await admin(request, "/matches/" + key, undefined, "GET")
  ).json();
  expect(retained.record.state).toBe("canceled");
  expect(retained.audit.map((a: any) => a.action)).toEqual(
    expect.arrayContaining(["roles_corrected", "match_canceled"]),
  );
  await expect(
    api.confirm(key, { rolesByPuuid, clientSubmissionId: "late" }, credential),
  ).rejects.toMatchObject({ code: "MATCH_CANCELED" });
});

test.afterEach(async ({ request }) => {
  const key = "KR:9000000000000000000099";
  const response = await request.get("/api/admin/matches/" + key, {
    headers: headers(),
  });
  if (response.ok() && (await response.json()).record.state === "registered")
    await admin(request, "/matches/" + key + "/cancel");
});
