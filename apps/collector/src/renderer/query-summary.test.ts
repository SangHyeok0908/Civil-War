import { expect, it } from "vitest";
import { summarizeQuery } from "./query-summary";
it("counts candidates, expected exclusions, and problems separately", () => {
  const summary = summarizeQuery(
    [
      { matchKey: "KR:1", code: null },
      { matchKey: "KR:2", code: "UNSUPPORTED_SCHEMA" },
      { matchKey: "KR:3", code: "UNSUPPORTED_SCHEMA" },
      { matchKey: "KR:4", code: "INSUFFICIENT_REGISTERED_PARTICIPANTS" },
      { matchKey: null, code: "LCU_UNAVAILABLE" },
    ],
    null,
  );
  expect(summary.total).toBe(5);
  expect(summary.candidates).toBe(1);
  expect(summary.excluded).toEqual([
    {
      code: "UNSUPPORTED_SCHEMA",
      count: 2,
      text: "내전 형식(사용자 설정 5대5)이 아닌 경기",
    },
    {
      code: "INSUFFICIENT_REGISTERED_PARTICIPANTS",
      count: 1,
      text: "등록 참가자가 6명 미만인 경기",
    },
  ]);
  expect(summary.problems).toEqual([
    {
      code: "LCU_UNAVAILABLE",
      count: 1,
      text: "롤 클라이언트 조회에 실패했습니다. 다시 조회하세요.",
    },
  ]);
  expect(summary.headline).toBe(
    "롤 기록 5경기를 확인했습니다. 내전 후보 1경기, 제외 3경기, 문제 1경기입니다.",
  );
  expect(summary.warning).toBeNull();
});
it("reports success without exclusions and keeps the history warning apart", () => {
  const summary = summarizeQuery(
    [{ matchKey: "KR:1", code: null }],
    "HISTORY_PAGINATION_STALLED",
  );
  expect(summary.headline).toBe(
    "롤 기록 1경기를 확인했습니다. 내전 후보 1경기입니다.",
  );
  expect(summary.excluded).toEqual([]);
  expect(summary.problems).toEqual([]);
  expect(summary.warning).toContain("더 오래된 기록은 확인하지 못했습니다");
});
it("explains an empty history", () => {
  expect(summarizeQuery([], null).headline).toBe(
    "롤 클라이언트에서 조회된 경기가 없습니다.",
  );
});
