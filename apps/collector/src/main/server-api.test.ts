import { expect, it } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HttpServerApi } from "./server-api";
import { Outbox } from "./outbox";
import { normalizeMatch } from "../../../../packages/lcu/src/normalize-match";
const raw = JSON.parse(
  readFileSync("fixtures/lcu/candidates/h2-20261021/G1.json", "utf8"),
);
const match = normalizeMatch(raw);
const actor = {
  memberId: "m",
  credentialId: "c",
  puuid: match.participants[0].puuid,
  token: "secret",
};
it("file-backed raw precision survives reopen and real HTTP body serialization", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cw-wire-"));
  let box: Outbox | undefined;
  try {
    const rawJson = JSON.stringify(raw).replace(
      '"platformId":',
      '"extra":0.12345678901234567890123456789,"big":900000000000000000000000000001,"platformId":',
    );
    box = new Outbox(join(dir, "queue.sqlite"));
    box.enqueueCollected(
      {
        schemaVersion: 1,
        rawMatch: JSON.parse(rawJson),
        rawJson,
        clientSubmissionId: "saved",
      },
      actor,
      match,
    );
    box.close();
    box = new Outbox(join(dir, "queue.sqlite"));
    let body = "";
    const api = new HttpServerApi(
      "https://example.test",
      async (_url, init) => {
        body = String(init?.body);
        expect(init?.redirect).toBe("error");
        expect((init?.headers as any).Authorization).toBe("Bearer secret");
        return new Response(
          JSON.stringify({
            matchKey: "KR:" + match.gameId,
            state: "pending",
            disposition: "already_pending",
          }),
        );
      },
    );
    await api.ingest(box.listOutbox()[0].payload, actor);
    expect(body).toContain("0.12345678901234567890123456789");
    expect(body).toContain("900000000000000000000000000001");
    expect(body).not.toContain("rawJson");
    expect(JSON.parse(body).rawMatch.gameId).toBe(match.gameId);
  } finally {
    box?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it("malformed server DTO never reaches renderer; unexpected fields stripped", async () => {
  let response: any = {
    matchKey: "KR:" + match.gameId,
    state: "pending",
    match: { ...match, rawMatch: { password: "bad" } },
    confirmedRoles: null,
    token: "bad",
  };
  const api = new HttpServerApi(
    "https://example.test",
    async () => new Response(JSON.stringify(response)),
  );
  const clean = await api.get("KR:" + match.gameId, actor);
  expect(JSON.stringify(clean)).not.toContain("bad");
  response = { ...response, state: "unknown" };
  await expect(api.get("KR:" + match.gameId, actor)).rejects.toThrow(
    "INVALID_SERVER_RESPONSE",
  );
  response = {
    ...response,
    state: "pending",
    match: { ...match, participants: [] },
  };
  await expect(api.get("KR:" + match.gameId, actor)).rejects.toThrow(
    "INVALID_SERVER_RESPONSE",
  );
});
it("Retry-After and errors sanitized; remote HTTP and credentials in origin rejected", async () => {
  const api = new HttpServerApi(
    "https://example.test",
    async () =>
      new Response(
        JSON.stringify({ code: "RATE_LIMITED", message: "secret response" }),
        { status: 429, headers: { "Retry-After": "60" } },
      ),
  );
  await expect(api.members(actor)).rejects.toMatchObject({
    code: "RATE_LIMITED",
    status: 429,
    retryAfter: 60000,
  });
  expect(() => new HttpServerApi("http://example.test")).toThrow();
  expect(
    () => new HttpServerApi("https://user:password@example.test"),
  ).toThrow();
});
