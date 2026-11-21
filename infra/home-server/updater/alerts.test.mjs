import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { formatAlert, readWebhookUrl, sendAlert } from "./alerts.mjs";

const at = new Date("2026-11-21T03:04:05Z");
const HOOK = "https://discord.com/api/webhooks/123/secret-token";

test("되돌림 알림에 커밋 앞 7자와 링크가 들어간다", () => {
  const p = formatAlert("rolled-back", {
    revision: "abcdef1234567",
    at,
    step: "health",
  });
  assert.match(p.content, /abcdef1/);
  assert.match(
    p.content,
    /https:\/\/github\.com\/SangHyeok0908\/Civil-War\/commit\/abcdef1234567/,
  );
  assert.match(p.content, /되돌림/);
  assert.deepEqual(p.allowed_mentions.parse, []);
});

test("다섯 종류 알림은 2000자 이하이며 서로 다르다", () => {
  const kinds = [
    "rolled-back",
    "rollback-failed",
    "backup-failed",
    "registry-unreachable",
    "test",
  ];
  const contents = kinds.map(
    (k) => formatAlert(k, { revision: null, at, step: "x" }).content,
  );
  for (const c of contents) assert.ok(c.length <= 2000);
  assert.equal(new Set(contents).size, 5);
  assert.match(contents[1], /수동 조치 필요/);
});

test("readWebhookUrl은 디스코드 주소만 허용한다", async () => {
  const dir = await mkdtemp(join(tmpdir(), "updater-alert-"));
  const write = async (name, text) => {
    const p = join(dir, name);
    await writeFile(p, text);
    return p;
  };
  assert.equal(await readWebhookUrl(await write("a", `  ${HOOK}\n`)), HOOK);
  const old = "https://discordapp.com/api/webhooks/1/x";
  assert.equal(await readWebhookUrl(await write("b", old)), old);
  assert.equal(
    await readWebhookUrl(await write("c", "https://example.com/hook")),
    null,
  );
  assert.equal(await readWebhookUrl(await write("d", "")), null);
  assert.equal(await readWebhookUrl(join(dir, "missing")), null);
});

test("sendAlert는 성공 여부만 돌려주고 예외를 던지지 않는다", async () => {
  const payload = formatAlert("test", { revision: null, at });
  const calls = [];
  const ok = async (url, init) => {
    calls.push({ url, init });
    return { status: 204, ok: true };
  };
  assert.equal(await sendAlert(HOOK, payload, ok), true);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(JSON.parse(calls[0].init.body).content, payload.content);

  const original = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a.join(" "));
  try {
    assert.equal(
      await sendAlert(HOOK, payload, async () => ({ status: 500, ok: false })),
      false,
    );
    const boom = async () => {
      throw new Error(`failed ${HOOK}`);
    };
    assert.equal(await sendAlert(HOOK, payload, boom), false);
  } finally {
    console.error = original;
  }
  assert.ok(logged.length >= 1);
  for (const l of logged)
    assert.ok(!l.includes("secret-token") && !l.includes(HOOK));

  let called = false;
  assert.equal(
    await sendAlert(null, payload, async () => (called = true)),
    false,
  );
  assert.equal(called, false);
});
