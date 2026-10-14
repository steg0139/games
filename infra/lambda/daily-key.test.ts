import { describe, expect, it } from "vitest";
import {
  MAX_DAY,
  MIN_DAY,
  codePk,
  dailyPk,
  normalizeCode,
  pk,
  readDailyKey,
} from "./daily-key";

describe("normalizeCode", () => {
  it("uppercases, strips spaces, and inserts the dash", () => {
    expect(normalizeCode("7xk92mh4")).toBe("7XK9-2MH4");
    expect(normalizeCode("7xk9-2mh4")).toBe("7XK9-2MH4");
    expect(normalizeCode("  7XK9 2MH4 ")).toBe("7XK9-2MH4");
  });

  it("rejects wrong length and characters outside the alphabet", () => {
    expect(normalizeCode("")).toBeNull();
    expect(normalizeCode("ABC")).toBeNull();
    expect(normalizeCode("ABCDE-FGHIJ")).toBeNull(); // 10 chars
    expect(normalizeCode("0OIL1234")).toBeNull(); // ambiguous chars excluded
    expect(normalizeCode("ABCD-12!3")).toBeNull();
  });
});

describe("key builders", () => {
  it("formats device, code, and daily partition keys", () => {
    expect(pk("abc-123")).toBe("DEVICE#abc-123");
    expect(codePk("7XK9-2MH4")).toBe("CODE#7XK9-2MH4");
    expect(dailyPk("sudoku", 20012, "easy")).toBe("DAILY#sudoku#20012#easy");
    expect(dailyPk("crossword", 20012, "-")).toBe("DAILY#crossword#20012#-");
  });
});

describe("readDailyKey", () => {
  it("accepts valid game/day/variant triples", () => {
    expect(readDailyKey({ game: "crossword", day: 20012, variant: "-" })).toEqual({
      game: "crossword",
      day: 20012,
      variant: "-",
    });
    expect(readDailyKey({ game: "sudoku", day: 20012, variant: "regular" })).toEqual(
      { game: "sudoku", day: 20012, variant: "regular" },
    );
    expect(
      readDailyKey({ game: "wordsearch", day: 20012, variant: "hard" }),
    ).toEqual({ game: "wordsearch", day: 20012, variant: "hard" });
  });

  it("rejects an unknown game", () => {
    expect(readDailyKey({ game: "blackjack", day: 20012, variant: "-" })).toBeNull();
    expect(readDailyKey({ game: "", day: 20012, variant: "-" })).toBeNull();
  });

  it("rejects a variant that doesn't belong to the game", () => {
    // Crossword only allows "-".
    expect(readDailyKey({ game: "crossword", day: 20012, variant: "easy" })).toBeNull();
    // Sudoku has no "medium" (that's word search).
    expect(readDailyKey({ game: "sudoku", day: 20012, variant: "medium" })).toBeNull();
    // Word search has no "regular" (that's sudoku).
    expect(
      readDailyKey({ game: "wordsearch", day: 20012, variant: "regular" }),
    ).toBeNull();
  });

  it("enforces the day-number window and integer type", () => {
    expect(readDailyKey({ game: "sudoku", day: MIN_DAY - 1, variant: "easy" })).toBeNull();
    expect(readDailyKey({ game: "sudoku", day: MAX_DAY + 1, variant: "easy" })).toBeNull();
    expect(readDailyKey({ game: "sudoku", day: 20012.5, variant: "easy" })).toBeNull();
    expect(readDailyKey({ game: "sudoku", day: MIN_DAY, variant: "easy" })).not.toBeNull();
    expect(readDailyKey({ game: "sudoku", day: MAX_DAY, variant: "easy" })).not.toBeNull();
  });

  it("rejects non-numeric / missing fields", () => {
    expect(readDailyKey({ game: "sudoku", day: "20012", variant: "easy" })).toBeNull();
    expect(readDailyKey({ game: "sudoku", variant: "easy" })).toBeNull();
    expect(readDailyKey({})).toBeNull();
  });
});
