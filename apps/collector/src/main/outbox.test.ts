import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Outbox } from "./outbox";
import { Uploader } from "./uploader";
import { normalizeMatch } from "../../../../packages/lcu/src/normalize-match";
import { ClientError } from "../../../../packages/contracts/src/index";
const raw = JSON.parse(
  readFileSync("fixtures/lcu/candidates/h2-20261021/G1.json", "utf8"),
);
const match = normalizeMatch(raw);
const key = "KR:" + match.gameId;
const actor = {
  memberId: "m1",
  credentialId: "c1",
  puuid: match.participants[0].puuid,
  token: "secret",
};
const roles = Object.fromEntries(
  match.participants.map((p, i) => [
    p.puuid,
    ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][i % 5],
  ]),
);
const paths: string[] = [];
const dbs: Outbox[] = [];
function db(path?: string) {
  const dir = mkdtempSync(join(tmpdir(), "cw-outbox-"));
  paths.push(dir);
  const b = new Outbox(path ?? join(dir, "state.sqlite"));
  dbs.push(b);
  return b;
}
afterEach(() => {
  for (const b of dbs) b.close();
  for (const p of paths) rmSync(p, { recursive: true, force: true });
  dbs.length = paths.length = 0;
});
function stage(b: Outbox) {
  return b.enqueueCollected(
    { schemaVersion: 1, rawMatch: raw, clientSubmissionId: "ingest" },
    actor,
    match,
  );
}
function confirm(b: Outbox) {
  return b.enqueueConfirmation(
    key,
    { rolesByPuuid: roles as any, clientSubmissionId: "confirm" },
    actor,
  );
}
function api() {
  let state = "pending";
  const calls: string[] = [];
  return {
    calls,
    get: async () => ({ matchKey: key, state, match, confirmedRoles: null }),
    ingest: async () => {
      calls.push("ingest");
      return { matchKey: key, state, disposition: "created_pending" };
    },
    confirm: async () => {
      calls.push("confirm");
      state = "registered";
      return { matchKey: key, disposition: "created" };
    },
    members: async () => [{ id: "m1", puuid: actor.puuid }],
  };
}
it("survivesRestart; sending resets; repeatedQueryCoalesces preserves roles", () => {
  const b = db();
  stage(b);
  confirm(b);
  b.db.exec("UPDATE outbox SET state='sending' WHERE kind='ingest'");
  const path = b.path;
  b.close();
  const reopened = db(path);
  stage(reopened);
  expect(reopened.listOutbox()).toHaveLength(2);
  expect(reopened.listOutbox()[0].state).toBe("pending");
  expect(reopened.listOutbox()[1].payload.rolesByPuuid).toEqual(roles);
});
it("offline stage+confirm FIFO/restart; no auto confirmation", async () => {
  const b = db();
  stage(b);
  const a = api();
  await new Uploader(b, a as any, async () => actor).drainOutbox();
  expect(a.calls).toEqual(["ingest"]);
  confirm(b);
  await new Uploader(b, a as any, async () => actor).drainOutbox();
  expect(a.calls).toEqual(["ingest", "confirm"]);
  expect(b.listOutbox().every((x) => x.state === "succeeded")).toBe(true);
});
it("lostIngestAndConfirmAck converges without duplicate registration", async () => {
  const b = db();
  stage(b);
  confirm(b);
  const a = api();
  let lost = true;
  const ingest = a.ingest;
  a.ingest = async () => {
    const result = await ingest();
    if (lost) {
      lost = false;
      throw new Error("offline");
    }
    return result;
  };
  const u = new Uploader(
    b,
    a as any,
    async () => actor,
    () => 0,
  );
  await u.drainOutbox();
  expect(a.calls).toEqual(["ingest"]);
  b.db.exec("UPDATE outbox SET next_at=0");
  const confirmCall = a.confirm;
  a.confirm = async () => {
    await confirmCall();
    throw new Error("lost");
  };
  await u.drainOutbox();
  b.db.exec("UPDATE outbox SET next_at=0");
  await u.drainOutbox();
  expect(a.calls.filter((x) => x === "confirm")).toHaveLength(1);
  expect(b.listOutbox().every((x) => x.state === "succeeded")).toBe(true);
});
it("switchedAccountCannotAdopt", async () => {
  const b = db();
  stage(b);
  const a = api();
  await new Uploader(b, a as any, async () => ({
    ...actor,
    memberId: "other",
    credentialId: "other",
  })).drainOutbox();
  expect(a.calls).toEqual([]);
  expect(b.listOutbox()[0].state).toBe("needs_attention");
});
it("canceledStopsRetry", async () => {
  const b = db();
  stage(b);
  confirm(b);
  const a = api();
  a.ingest = async () => ({
    matchKey: key,
    state: "canceled",
    disposition: "already_canceled",
  });
  await new Uploader(b, a as any, async () => actor).drainOutbox();
  expect(a.calls).toEqual([]);
  expect(b.listOutbox().every((x) => x.state === "needs_attention")).toBe(true);
  expect(b.matches(actor)[0].state).toBe("canceled");
});
it("concurrent drains single worker", async () => {
  const b = db();
  stage(b);
  const a = api();
  const u = new Uploader(b, a as any, async () => actor);
  await Promise.all([u.drainOutbox(), u.drainOutbox()]);
  expect(a.calls).toEqual(["ingest"]);
});
it("strict FIFO blocks younger games while oldest request is in backoff", async () => {
  const b = db();
  stage(b);
  b.enqueueCollected(
    {
      schemaVersion: 1,
      rawMatch: { ...raw, gameId: "2" },
      clientSubmissionId: "second",
    },
    actor,
    { ...match, gameId: "2" },
  );
  b.db.exec("UPDATE outbox SET next_at=999999 WHERE id=1");
  const a = api();
  await new Uploader(
    b,
    a as any,
    async () => actor,
    () => 0,
  ).drainOutbox();
  expect(a.calls).toEqual([]);
});
it.each([
  [401, "AUTH_REVOKED"],
  [403, "ACCOUNT_MISMATCH"],
  [422, "INVALID_MATCH"],
])("permanent %s %s stops retries", async (status, code) => {
  const b = db();
  stage(b);
  const a = api();
  a.ingest = async () => {
    throw new ClientError(String(code), Number(status));
  };
  const u = new Uploader(b, a as any, async () => actor);
  await u.drainOutbox();
  expect(b.listOutbox()[0]).toMatchObject({
    state: "needs_attention",
    error: code,
    nextAt: 0,
  });
  await u.drainOutbox();
  expect(b.listOutbox()[0].attempts).toBe(1);
});
it("429 respects Retry-After and transient backoff caps with jitter", async () => {
  const b = db();
  stage(b);
  const a = api();
  a.ingest = async () => {
    throw new ClientError("RATE_LIMITED", 429, 60000);
  };
  await new Uploader(
    b,
    a as any,
    async () => actor,
    () => 1000,
    () => 0,
  ).drainOutbox();
  expect(b.listOutbox()[0].nextAt).toBe(61000);
  b.db.exec("UPDATE outbox SET next_at=0,attempts=50");
  a.ingest = async () => {
    throw new ClientError("INTERNAL_ERROR", 500);
  };
  await new Uploader(
    b,
    a as any,
    async () => actor,
    () => 1000,
    () => 0.5,
  ).drainOutbox();
  expect(b.listOutbox()[0].nextAt).toBe(901000);
});
it("cleanup retains unfinished raw and clears only registered aged raw", async () => {
  const b = db();
  stage(b);
  b.cleanup(Date.now() + 31 * 86400000);
  expect(b.listOutbox()[0].payload.rawMatch).toBeDefined();
  confirm(b);
  await new Uploader(b, api() as any, async () => actor).drainOutbox();
  b.cleanup(Date.now() + 31 * 86400000);
  expect(b.listOutbox()[0].payload).toEqual({});
  expect(b.matches(actor)[0].matchKey).toBe(key);
});
it("confirmation is not succeeded until authoritative server state is registered", async () => {
  const b = db();
  stage(b);
  confirm(b);
  const a = api();
  a.confirm = async () => ({ matchKey: key, disposition: "created" });
  await new Uploader(b, a as any, async () => actor).drainOutbox();
  expect(b.listOutbox()[1].state).toBe("pending");
  expect(b.listOutbox()[1].error).toBe("INVALID_SERVER_RESPONSE");
  expect(b.matches(actor)[0].state).toBe("pending");
});
it("first local ingest preserves a previously fetched authoritative server record", () => {
  const b = db();
  b.saveMatch(actor, {
    matchKey: key,
    state: "registered",
    match,
    confirmedRoles: roles as any,
  });
  b.enqueueCollected(
    { schemaVersion: 1, rawMatch: raw, clientSubmissionId: "query" },
    actor,
    { ...match, durationSeconds: 10 },
  );
  expect(b.matches(actor)[0]).toMatchObject({
    state: "registered",
    confirmedRoles: roles,
    match: { durationSeconds: match.durationSeconds },
  });
});
