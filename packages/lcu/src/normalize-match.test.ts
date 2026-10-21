import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeMatch } from "./normalize-match";
import { parseJson } from "../../../tools/lcu-probe/client.mjs";
const fixture = (g: string) =>
  JSON.parse(
    readFileSync(`fixtures/lcu/candidates/h2-20261021/${g}.json`, "utf8"),
  );
describe("v1 independent fixture parity", () => {
  for (const g of ["G1", "G2", "G3"])
    it(g, () =>
      expect(normalizeMatch(fixture(g))).toEqual(
        JSON.parse(
          readFileSync(`fixtures/contracts/v1/${g}.normalized.json`, "utf8"),
        ),
      ),
    );
  it("preserves game ID before number rounding", () => {
    const raw = readFileSync(
      "fixtures/lcu/candidates/h2-20261021/G1.json",
      "utf8",
    ).replace('"9000000000000000000001"', "9000000000000000000001");
    expect(normalizeMatch(parseJson(raw)).gameId).toBe(
      "9000000000000000000001",
    );
  });
  it("zero differs from missing", () => {
    const r = fixture("G1");
    r.participants[0].stats.visionScore = 0;
    expect(normalizeMatch(r).participants[0].visionScore).toBe(0);
    delete r.participants[0].stats.visionScore;
    expect(() => normalizeMatch(r)).toThrow("REQUIRED");
  });
  it.each(["queueId", "mapId", "endOfGameResult"])(
    "unsupported tuple %s",
    (key) => {
      const r = fixture("G1");
      r[key] = "wrong";
      expect(() => normalizeMatch(r)).toThrow();
    },
  );
  it("rejects duplicate identities and malformed teams", () => {
    const r = fixture("G1");
    r.participantIdentities[1].player.puuid =
      r.participantIdentities[0].player.puuid;
    expect(() => normalizeMatch(r)).toThrow();
  });
});
