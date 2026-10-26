import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import type { APIRequestContext } from "@playwright/test";
import type { AdminMember } from "../../apps/web/src/types";
export const origin = "http://localhost:18080";
export function state(): {
  adminCode: string;
  cookie: string;
  csrf: string;
  members: AdminMember[];
  keys: string[];
  collectorCode: string;
} {
  return JSON.parse(readFileSync("test-results/web-state.json", "utf8"));
}
export function headers() {
  const s = state();
  return { Cookie: s.cookie, "X-CSRF-Token": s.csrf, Origin: origin };
}
export async function admin(
  request: APIRequestContext,
  url: string,
  body?: unknown,
  method = "POST",
) {
  const r = await request.fetch("/api/admin" + url, {
    method,
    headers: headers(),
    ...(body !== undefined ? { data: body } : {}),
  });
  if (!r.ok())
    throw Error(
      "Admin fixture " + url + " " + r.status() + " " + (await r.text()),
    );
  return r;
}
export function sql(query: string) {
  return execFileSync(
    process.env.CW_DOCKER ||
      (existsSync("/usr/local/bin/docker")
        ? "/usr/local/bin/docker"
        : "docker"),
    [
      "compose",
      "-f",
      "infra/compose.test.yml",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "cw_test",
      "-d",
      "cw_web_test",
      "-v",
      "ON_ERROR_STOP=1",
      "-tAc",
      query,
    ],
    { encoding: "utf8" },
  ).trim();
}
export async function login(
  page: import("@playwright/test").Page,
  request: APIRequestContext,
) {
  const reply = await (
    await admin(request, "/codes", { scope: "admin" })
  ).json();
  await page.goto("/admin");
  await page.getByLabel("운영자 등록 코드").fill(reply.code);
  await page.getByRole("button", { name: "운영자 인증" }).click();
  await page.waitForURL("**/admin/members");
}
