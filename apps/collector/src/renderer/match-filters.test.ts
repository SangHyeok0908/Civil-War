import { expect, it } from "vitest";
import { selectMatches } from "./match-filters";
import type { MatchView } from "../preload/collector-api";
const rows = [
  {
    matchKey: "KR:2",
    status: "등록 완료",
    match: { startedAtUtc: "2026-01-01T00:00:00Z" },
  },
  {
    matchKey: "KR:1",
    status: "확인 대기",
    match: { startedAtUtc: "2026-01-02T00:00:00Z" },
  },
  {
    matchKey: "KR:3",
    status: "전송 대기",
    match: { startedAtUtc: "2026-01-01T00:00:00Z" },
  },
] as MatchView[];
it("all sorted by match time descending with stable key tie", () =>
  expect(selectMatches(rows, "전체").map((x) => x.matchKey)).toEqual([
    "KR:1",
    "KR:3",
    "KR:2",
  ]));
it("selected state shows only matching games and leaves source intact", () => {
  expect(selectMatches(rows, "확인 대기").map((x) => x.matchKey)).toEqual([
    "KR:1",
  ]);
  expect(selectMatches(rows, "문제 해결 필요")).toEqual([]);
  expect(rows[0].matchKey).toBe("KR:2");
});
