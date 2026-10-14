import { describe, expect, it } from "vitest";
import { type DailyResult, rankDailyResults } from "./daily-compete";

const r = (
  code: string,
  timeSeconds: number,
  hints = 0,
  completedAt = 0,
): DailyResult => ({ code, displayName: code, timeSeconds, hints, completedAt });

describe("rankDailyResults", () => {
  it("orders by fastest time", () => {
    const ranked = rankDailyResults([r("a", 300), r("b", 120), r("c", 240)]);
    expect(ranked.map((x) => x.code)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties by fewer hints", () => {
    const ranked = rankDailyResults([
      r("a", 200, 3),
      r("b", 200, 0),
      r("c", 200, 1),
    ]);
    expect(ranked.map((x) => x.code)).toEqual(["b", "c", "a"]);
  });

  it("breaks a time+hints tie by earlier completion", () => {
    const ranked = rankDailyResults([
      r("late", 200, 1, 2000),
      r("early", 200, 1, 1000),
    ]);
    expect(ranked.map((x) => x.code)).toEqual(["early", "late"]);
  });

  it("sorts entries with a non-finite time last", () => {
    const ranked = rankDailyResults([
      r("missing", Number.NaN),
      r("fast", 90),
    ]);
    expect(ranked.map((x) => x.code)).toEqual(["fast", "missing"]);
  });

  it("does not mutate the input array", () => {
    const input = [r("a", 300), r("b", 120)];
    const copy = [...input];
    rankDailyResults(input);
    expect(input).toEqual(copy);
  });

  it("returns an empty array unchanged", () => {
    expect(rankDailyResults([])).toEqual([]);
  });
});
