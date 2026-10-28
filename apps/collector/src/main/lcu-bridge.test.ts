import { expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LcuClient } from "./lcu-client";
import { CredentialStore } from "./credential-store";
import { validSender, validateCommand } from "./ipc";
const raw = readFileSync("fixtures/lcu/candidates/h2-20261021/G1.json", "utf8");
it("noHistoryFetchOnLaunch; portChanged reads latest lockfile", async () => {
  let port = 1;
  const paths: string[] = [];
  const ports: number[] = [];
  const client = new LcuClient(
    async () => ({ port: port++, password: "private", protocol: "https" }),
    async (c, p) => {
      ports.push(c.port);
      paths.push(p);
      return {
        status: 200,
        body: '{"puuid":"p1","gameName":"Name","tagLine":"KR1"}',
      };
    },
  );
  await client.getAccount();
  await client.getAccount();
  expect(paths).toEqual([
    "/lol-summoner/v1/current-summoner",
    "/lol-summoner/v1/current-summoner",
  ]);
  expect(ports).toEqual([1, 2]);
});
it("clientStopped returns safe error", async () => {
  const c = new LcuClient(async () => {
    throw new Error("private password");
  });
  await expect(c.getAccount()).rejects.toThrow("CLIENT_NOT_RUNNING");
});
it("pagination fetches full detail and preserves original raw decimals", async () => {
  const paths: string[] = [];
  const c = new LcuClient(
    async () => ({ port: 1, password: "private", protocol: "https" }),
    async (_, p) => {
      paths.push(p);
      if (p.includes("/products/"))
        return {
          status: 200,
          body: JSON.stringify({
            games: {
              games: p.includes("begIndex=0")
                ? Array.from({ length: 20 }, () => ({
                    gameId: "9000000000000000000001",
                  }))
                : [],
            },
          }),
        };
      return {
        status: 200,
        body: raw.replace(
          '"platformId":',
          '"extra":0.12345678901234567890123456789,"platformId":',
        ),
      };
    },
  );
  expect(await c.listPastMatches("p1")).toEqual({
    ids: ["9000000000000000000001"],
    warningCode: null,
  });
  const capture = await c.getMatch("9000000000000000000001");
  expect(capture.rawJson).toContain("0.12345678901234567890123456789");
  expect(paths).toHaveLength(3);
});
it("repeated full history pages retain unique IDs and report incomplete pagination", async () => {
  const paths: string[] = [];
  const rows = Array.from({ length: 20 }, (_, index) => ({
    gameId: String(9000 + index),
  }));
  const client = new LcuClient(
    async () => ({ port: 1, password: "private", protocol: "https" }),
    async (_, path) => {
      paths.push(path);
      return {
        status: 200,
        body: JSON.stringify({
          games: {
            gameIndexBegin: 0,
            gameIndexEnd: 19,
            gameCount: 20,
            games: rows,
          },
        }),
      };
    },
  );

  const result = await client.listPastMatches("p1");

  expect(result).toEqual({
    ids: rows.map((row) => row.gameId),
    warningCode: "HISTORY_PAGINATION_STALLED",
  });
  expect(paths).toEqual([
    "/lol-match-history/v1/products/lol/p1/matches?begIndex=0&endIndex=19",
    "/lol-match-history/v1/products/lol/p1/matches?begIndex=20&endIndex=39",
  ]);
});
it("overlapping pages continue when a new game appears and stop on a short page", async () => {
  let page = 0;
  const client = new LcuClient(
    async () => ({ port: 1, password: "private", protocol: "https" }),
    async () => ({
      status: 200,
      body: JSON.stringify({
        games: {
          games:
            page++ === 0
              ? Array.from({ length: 20 }, (_, index) => ({
                  gameId: String(index + 1),
                }))
              : page === 2
                ? Array.from({ length: 20 }, (_, index) => ({
                    gameId: String(index + 2),
                  }))
                : [],
        },
      }),
    }),
  );

  expect(await client.listPastMatches("p1")).toEqual({
    ids: Array.from({ length: 21 }, (_, index) => String(index + 1)),
    warningCode: null,
  });
  expect(page).toBe(3);
});
it("malformed history and HTTP failures remain errors rather than partial success", async () => {
  for (const response of [
    { status: 200, body: '{"games":{"games":[{"gameId":"not-a-game"}]}}' },
    { status: 503, body: "{}" },
  ]) {
    const client = new LcuClient(
      async () => ({ port: 1, password: "private", protocol: "https" }),
      async () => response,
    );
    await expect(client.listPastMatches("p1")).rejects.toThrow(
      response.status === 200 ? "INVALID_HISTORY" : "LCU_UNAVAILABLE",
    );
  }
});
it("noTokenInRenderer; encrypted storage and decrypt failure never falls back", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cw-cred-"));
  try {
    const path = join(dir, "credential");
    const crypto = {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from(s).reverse(),
      decryptString: (b: Buffer) => Buffer.from(b).reverse().toString(),
    };
    const store = new CredentialStore(path, crypto, "win32");
    await store.save({
      token: "secret-token",
      memberId: "m",
      credentialId: "c",
      puuid: "p",
    });
    expect(readFileSync(path, "utf8")).not.toContain("secret-token");
    expect((await store.load())?.memberId).toBe("m");
    writeFileSync(path, "broken");
    await expect(store.load()).rejects.toThrow("REENROLL_REQUIRED");
    const unavailable = new CredentialStore(
      path,
      { ...crypto, isEncryptionAvailable: () => false },
      "win32",
    );
    await expect(
      unavailable.save({
        token: "secret",
        memberId: "m",
        credentialId: "c",
        puuid: "p",
      }),
    ).rejects.toThrow("PROTECTION_UNAVAILABLE");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("IPC rejects subframes, wrong sender, extra properties, malformed roles", () => {
  expect(
    validSender(
      { senderId: 3, frameUrl: "file:///app/index.html", isMainFrame: true },
      3,
      "file:///app/index.html",
    ),
  ).toBe(true);
  for (const event of [
    { senderId: 4, frameUrl: "file:///app/index.html", isMainFrame: true },
    { senderId: 3, frameUrl: "https://evil.test", isMainFrame: true },
    { senderId: 3, frameUrl: "file:///app/index.html", isMainFrame: false },
  ])
    expect(validSender(event, 3, "file:///app/index.html")).toBe(false);
  expect(() =>
    validateCommand("enroll", { code: "x", token: "evil" }),
  ).toThrow();
  expect(() =>
    validateCommand("confirm", {
      matchKey: "KR:1",
      inhouse: true,
      rolesByPuuid: { p: 1 },
    }),
  ).toThrow();
  expect(() =>
    validateCommand("query", { url: "https://evil.test" }),
  ).toThrow();
});
