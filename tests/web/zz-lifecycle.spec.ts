import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { state, sql, admin, origin } from "./helpers";
test("activeWorkerCrash rollsBackPublication CLI neverClaims restartRecovers", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const s = state();
  sql(
    "CREATE FUNCTION browser_pause_publish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(12); RETURN NEW; END $$; CREATE TRIGGER browser_pause_publish BEFORE INSERT ON evaluation_generations FOR EACH ROW EXECUTE FUNCTION browser_pause_publish()",
  );
  try {
    await admin(
      request,
      "/members/" + s.members[0].id,
      { seedSkill: 67 },
      "PATCH",
    );
    await expect
      .poll(() =>
        sql(
          "select status from recalculation_jobs order by source_revision desc limit 1",
        ),
      )
      .toBe("running");
    expect((await request.get("/api/rankings")).status()).toBe(202);
    await request.post("http://127.0.0.1:18081/stop");
  } finally {
    sql(
      "DROP TRIGGER browser_pause_publish ON evaluation_generations; DROP FUNCTION browser_pause_publish()",
    );
  }
  expect(sql("select active_generation_id from service_state")).toBe("");
  expect(
    sql(
      "select status from recalculation_jobs order by source_revision desc limit 1",
    ),
  ).toBe("running");
  const java = process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, "bin", "java")
    : "java";
  const output = execFileSync(
    java,
    [
      "-jar",
      "apps/server/build/libs/civil-war-server-0.1.0-provisional.jar",
      "--spring.profiles.active=dev",
      "--logging.level.root=WARN",
      "admin:code",
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: "jdbc:postgresql://localhost:55432/cw_web_test",
        DATABASE_USER: "cw_test",
        DATABASE_PASSWORD: "cw_test_only",
        SERVER_ORIGIN: origin,
      },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  expect(output).toContain("ADMIN_CODE=");
  expect(
    sql(
      "select status from recalculation_jobs order by source_revision desc limit 1",
    ),
  ).toBe("running");
  expect(sql("select active_generation_id from service_state")).toBe("");
  await request.post("http://127.0.0.1:18081/start");
  await expect
    .poll(async () => (await request.get("/api/rankings")).status(), {
      timeout: 20000,
    })
    .toBe(200);
  expect(
    sql(
      "select status from recalculation_jobs order by source_revision desc limit 1",
    ),
  ).toBe("succeeded");
  expect(
    Number(
      sql(
        "select attempts from recalculation_jobs order by source_revision desc limit 1",
      ),
    ),
  ).toBe(2);
  await page.goto("/rankings");
  await expect(
    page.getByRole("heading", { name: "활약 랭킹", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".rankings tbody tr")).toHaveCount(11);
});
