import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { score } from "./components/Common";
afterEach(() => vi.unstubAllGlobals());
it("malformed200IsAnExplicitError", async () => {
  vi.stubGlobal("fetch", async () => new Response("{broken", { status: 200 }));
  await expect(api("/api/matches")).rejects.toMatchObject({
    code: "INVALID_RESPONSE",
  });
});
it("scoreDisplayMatchesServerCompetitionRounding", () => {
  expect(score(2.675)).toBe("2.68");
  expect(score(50.004)).toBe("50.00");
  expect(score(50.005)).toBe("50.01");
  expect(score(null)).toBe("—");
});
