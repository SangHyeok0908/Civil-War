import { expect, it } from "vitest";
import { suggestMatchRoles } from "./role-hints";
const rows = [
  { puuid: "guest", teamId: 100, lane: "BOTTOM", role: "DUO_CARRY" },
  { puuid: "support", teamId: 100, lane: "BOTTOM", role: "DUO_SUPPORT" },
  { puuid: "top", teamId: 100, lane: "TOP", role: "SOLO" },
];
it("clearLaneRolePrefills and guestsUseSameEvidenceRules", () =>
  expect(suggestMatchRoles(rows).map((x) => x.role)).toEqual([
    "BOTTOM",
    "UTILITY",
    "TOP",
  ]));
it("ambiguousBottomRemainsUnselected", () =>
  expect(
    suggestMatchRoles([{ puuid: "a", teamId: 100, lane: "BOTTOM" }])[0].role,
  ).toBeNull());
it("duplicateRoleCandidatesRemainUnselected", () =>
  expect(
    suggestMatchRoles([
      ...rows,
      { puuid: "other", teamId: 100, lane: "TOP", role: "SOLO" },
    ])
      .slice(2)
      .map((x) => x.role),
  ).toEqual([null, null]));
it("conflicting direct and timeline evidence stays unselected", () =>
  expect(
    suggestMatchRoles([
      {
        puuid: "a",
        teamId: 100,
        teamPosition: "TOP",
        lane: "MIDDLE",
        role: "SOLO",
      },
    ])[0].role,
  ).toBeNull());
