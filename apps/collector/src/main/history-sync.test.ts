import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Outbox } from "./outbox";
import { CollectorService } from "./history-sync";
import { normalizeMatch } from "../../../../packages/lcu/src/normalize-match";
import { ClientError, ROLES } from "../../../../packages/contracts/src/index";
const raw = JSON.parse(
  readFileSync("fixtures/lcu/candidates/h2-20261021/G1.json", "utf8"),
);
const match = normalizeMatch(raw);
const key = "KR:" + match.gameId;
const actor = {
  token: "device-secret",
  memberId: "m0",
  credentialId: "c0",
  puuid: match.participants[0].puuid,
};
const roles = Object.fromEntries(
  match.participants.map((p, i) => [p.puuid, ROLES[i % 5]]),
);
const boxes: Outbox[] = [];
afterEach(() => {
  boxes.forEach((b) => b.close());
  boxes.length = 0;
});
function setup() {
  const box = new Outbox(":memory:");
  boxes.push(box);
  let cred: any = actor;
  const lcu = {
    getAccount: vi.fn(async () => ({
      puuid: actor.puuid,
      displayName: "수집자",
    })),
    listPastMatches: vi.fn(async () => [match.gameId]),
    getMatch: vi.fn(async () => ({
      rawMatch: raw,
      rawJson: JSON.stringify(raw),
    })),
  };
  let state: "pending" | "registered" | "canceled" = "pending";
  const roster = match.participants.map((p, i) => ({
    id: "m" + i,
    puuid: p.puuid,
    displayName: "회원" + i,
    riotId: "회원" + i + "#KR1",
    active: true,
  }));
  const api = {
    enroll: vi.fn(async () => actor),
    members: vi.fn(async () => roster),
    pending: vi.fn(async () => [] as any[]),
    get: vi.fn(async () => ({
      matchKey: key,
      state,
      match,
      confirmedRoles: state === "registered" ? roles : null,
    })),
    ingest: vi.fn(async () => ({
      matchKey: key,
      state,
      disposition: "created_pending",
    })),
    confirm: vi.fn(async () => {
      state = "registered";
      return { disposition: "created" };
    }),
  };
  const store = {
    load: async () => cred,
    save: async (c: any) => {
      cred = c;
    },
  };
  return {
    box,
    lcu,
    api,
    store,
    service: new CollectorService(lcu, api, store, box),
  };
}
it("noHistoryFetchOnLaunch and noTokenInRenderer", async () => {
  const x = setup();
  await x.service.initialize();
  expect(x.lcu.listPastMatches).not.toHaveBeenCalled();
  expect(x.lcu.getMatch).not.toHaveBeenCalled();
  expect(JSON.stringify(await x.service.snapshot())).not.toContain(
    "device-secret",
  );
});
it("buttonFetchesAndStages but noAutoRegistration; explicit 5+5 roles", async () => {
  const x = setup();
  await x.service.initialize();
  const result = await x.service.queryPastMatches();
  expect(result.snapshot.matches[0].status).toBe("확인 대기");
  expect(x.api.confirm).not.toHaveBeenCalled();
  await expect(
    x.service.confirmRegistration(key, roles, false),
  ).rejects.toThrow();
  await expect(
    x.service.confirmRegistration(
      key,
      Object.fromEntries(Object.keys(roles).map((k) => [k, "TOP"])),
      true,
    ),
  ).rejects.toThrow();
  expect(
    (await x.service.confirmRegistration(key, roles, true)).matches[0].status,
  ).toBe("등록 완료");
});
it("offlineThenResume uses roster cache and confirm FIFO", async () => {
  const x = setup();
  await x.service.initialize();
  x.api.members.mockRejectedValue(new ClientError("NETWORK_ERROR"));
  x.api.ingest.mockRejectedValueOnce(new ClientError("NETWORK_ERROR"));
  let r = await x.service.queryPastMatches();
  expect(r.snapshot.matches[0].status).toBe("전송 대기");
  const s = await x.service.confirmRegistration(key, roles, true);
  expect(s.matches[0].status).toBe("등록 대기");
  expect(x.api.confirm).not.toHaveBeenCalled();
  x.box.db.exec("UPDATE outbox SET next_at=0");
  await x.service.tick();
  expect((await x.service.snapshot()).matches[0].status).toBe("등록 완료");
});
it("queryFailureIsNotPending; unknown member and account mismatch blocked", async () => {
  const x = setup();
  await x.service.initialize();
  x.lcu.getMatch.mockRejectedValueOnce(new ClientError("LCU_UNAVAILABLE"));
  expect((await x.service.queryPastMatches()).results[0].code).toBe(
    "LCU_UNAVAILABLE",
  );
  expect(x.box.listOutbox()).toHaveLength(0);
  x.box.cache("members:" + actor.memberId, []);
  expect((await x.service.queryPastMatches()).results[0].code).toBe(
    "UNREGISTERED_PARTICIPANT",
  );
  x.lcu.getAccount.mockResolvedValue({
    puuid: "different",
    displayName: "다른 계정",
  });
  await expect(x.service.queryPastMatches()).rejects.toThrow(
    "ACCOUNT_MISMATCH",
  );
  expect(x.box.listOutbox()).toHaveLength(0);
});
it("server pending remains visible when LCU history expires", async () => {
  const x = setup();
  x.api.pending.mockResolvedValue([
    { matchKey: key, state: "pending", match, confirmedRoles: null },
  ]);
  x.lcu.listPastMatches.mockResolvedValue([]);
  await x.service.initialize();
  expect((await x.service.queryPastMatches()).snapshot.matches).toHaveLength(1);
});
it("repeated query preserves drafts; registered displays authoritative roles", async () => {
  const x = setup();
  await x.service.initialize();
  await x.service.queryPastMatches();
  const draft = { ...roles, [match.participants[0].puuid]: "UTILITY" as const };
  await x.service.saveDraft(key, draft);
  await x.service.queryPastMatches();
  expect((await x.service.snapshot()).matches[0].roles).toEqual(draft);
  await x.service.confirmRegistration(key, roles, true);
  expect((await x.service.snapshot()).matches[0].roles).toEqual(roles);
});
it("cached upload when LCU stopped, known account switch blocks ownership", async () => {
  const x = setup();
  await x.service.initialize();
  x.api.ingest.mockRejectedValueOnce(new ClientError("NETWORK_ERROR"));
  await x.service.queryPastMatches();
  x.box.db.exec("UPDATE outbox SET next_at=0");
  x.lcu.getAccount.mockRejectedValue(new ClientError("CLIENT_NOT_RUNNING"));
  await x.service.tick();
  expect(x.api.ingest).toHaveBeenCalledTimes(2);
  expect(x.lcu.listPastMatches).toHaveBeenCalledTimes(1);
});
it("same member rotation requires explicit verified resume; other identity rejected", async () => {
  const x = setup();
  await x.service.initialize();
  x.api.ingest.mockRejectedValueOnce(new ClientError("AUTH_REVOKED", 401));
  await x.service.queryPastMatches();
  x.api.enroll.mockResolvedValueOnce({ ...actor, credentialId: "rotated" });
  await x.service.enroll("code");
  expect(x.box.listOutbox()[0].credentialId).toBe("c0");
  expect(x.box.listOutbox()[0].state).toBe("needs_attention");
  await x.service.resumeOwnRequests();
  expect(x.box.listOutbox()[0].state).toBe("succeeded");
});
it("duplicate query refreshes externally registered roles and later cancellation", async () => {
  const x = setup();
  await x.service.initialize();
  await x.service.queryPastMatches();
  x.api.get.mockResolvedValueOnce({
    matchKey: key,
    state: "registered",
    match,
    confirmedRoles: roles,
  });
  await x.service.queryPastMatches();
  expect((await x.service.snapshot()).matches[0].roles).toEqual(roles);
  x.api.get.mockResolvedValueOnce({
    matchKey: key,
    state: "canceled",
    match,
    confirmedRoles: roles,
  });
  await x.service.queryPastMatches();
  expect((await x.service.snapshot()).matches[0].status).toBe("등록 취소");
});
it("explicit saved confirmation works with LCU stopped but known mismatch remains blocked", async () => {
  const x = setup();
  await x.service.initialize();
  await x.service.queryPastMatches();
  x.lcu.getAccount.mockRejectedValue(new ClientError("CLIENT_NOT_RUNNING"));
  expect(
    (await x.service.confirmRegistration(key, roles, true)).matches[0].status,
  ).toBe("등록 완료");
  x.lcu.getAccount.mockResolvedValueOnce({
    puuid: "other",
    displayName: "other",
  });
  await x.service.getAccount();
  await expect(x.service.resumeOwnRequests()).rejects.toThrow(
    "ACCOUNT_MISMATCH",
  );
});
it("local startup does not wait for an unresolved remote server", async () => {
  const x = setup();
  x.api.members.mockImplementation(() => new Promise(() => {}));
  const snapshot = await x.service.initializeLocal();
  expect(snapshot.account.enrolled).toBe(true);
  expect(x.api.members).not.toHaveBeenCalled();
  expect(x.lcu.listPastMatches).not.toHaveBeenCalled();
});
it("cached roster collection persists before delayed server requests finish", async () => {
  const x = setup();
  await x.service.initialize();
  let release: () => void = () => {};
  const blocked = new Promise<void>((r) => {
    release = r;
  });
  x.api.members.mockImplementation(async () => {
    await blocked;
    throw new ClientError("NETWORK_ERROR");
  });
  x.api.ingest.mockImplementationOnce(async () => {
    await blocked;
    throw new ClientError("NETWORK_ERROR");
  });
  const refresh = x.service.refreshRemote();
  const query = x.service.queryPastMatches();
  await vi.waitFor(() => expect(x.box.listOutbox()).toHaveLength(1));
  expect(x.lcu.getMatch).toHaveBeenCalledTimes(1);
  expect((await x.service.snapshot()).matches[0].status).toBe("전송 대기");
  release();
  await Promise.all([refresh, query]);
});
it("local disk failure is not reported as saved", async () => {
  const x = setup();
  await x.service.initialize();
  vi.spyOn(x.box, "enqueueCollected").mockImplementation(() => {
    throw new Error("disk full");
  });
  const r = await x.service.queryPastMatches();
  expect(r.results[0].code).toBe("LOCAL_SAVE_FAILED");
  expect(r.snapshot.matches).toEqual([]);
});
it("different account pending ownership blocks enrollment before consuming code", async () => {
  const x = setup();
  await x.service.initialize();
  x.api.ingest.mockRejectedValueOnce(new ClientError("NETWORK_ERROR"));
  await x.service.queryPastMatches();
  x.lcu.getAccount.mockResolvedValue({ puuid: "other", displayName: "other" });
  await expect(x.service.enroll("new-code")).rejects.toThrow(
    "PENDING_OWNER_MISMATCH",
  );
  expect(x.api.enroll).not.toHaveBeenCalled();
});
it("decryption failure remains visible even if League is stopped", async () => {
  const x = setup();
  x.store.load = async () => {
    throw new ClientError("REENROLL_REQUIRED");
  };
  x.lcu.getAccount.mockRejectedValue(new ClientError("CLIENT_NOT_RUNNING"));
  const s = await x.service.initializeLocal();
  expect(s.account.code).toBe("REENROLL_REQUIRED");
});

it("late pending list cannot undo a background registration", async () => {
  const x = setup();
  await x.service.initialize();
  await x.service.queryPastMatches();
  x.box.enqueueConfirmation(
    key,
    { rolesByPuuid: roles, clientSubmissionId: "offline-confirm" },
    actor,
  );
  let release: (records: any[]) => void = () => {};
  const delayed = new Promise<any[]>((resolve) => {
    release = resolve;
  });
  x.api.pending.mockReturnValueOnce(delayed);
  const refresh = x.service.loadPendingMatches();
  await x.service.tick();
  expect((await x.service.snapshot()).matches[0].status).toBe("등록 완료");
  release([{ matchKey: key, state: "pending", match, confirmedRoles: null }]);
  const refreshed = await refresh;
  expect(refreshed.matches[0]).toMatchObject({
    state: "registered",
    status: "등록 완료",
    roles,
  });
  expect(x.box.listOutbox().every((item) => item.state === "succeeded")).toBe(
    true,
  );
});
