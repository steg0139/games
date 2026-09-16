import { describe, expect, it } from "vitest";
import { PUZZLES } from "./puzzles";
import { buildCrosswordData, dayNumber, puzzleForDay } from "./logic";

describe("puzzle library", () => {
  it("has a substantial number of puzzles", () => {
    expect(PUZZLES.length).toBeGreaterThanOrEqual(90);
  });

  it("every puzzle produces a valid interlocking grid", () => {
    for (const puzzle of PUZZLES) {
      const { data, placed } = buildCrosswordData(puzzle);
      expect(placed).toBeGreaterThanOrEqual(8);
      const entries = [
        ...Object.values(data.across),
        ...Object.values(data.down),
      ];
      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        expect(e.row).toBeGreaterThanOrEqual(0);
        expect(e.col).toBeGreaterThanOrEqual(0);
        expect(e.answer).toMatch(/^[A-Z]+$/);
        expect(e.clue.length).toBeGreaterThan(0);
        // The clue must not contain its own answer.
        expect(e.clue.toLowerCase()).not.toContain(e.answer.toLowerCase());
      }
    }
  });
});

describe("daily rotation", () => {
  it("is deterministic for a given date", () => {
    const d = new Date(2026, 8, 15);
    expect(puzzleForDay(d)).toBe(puzzleForDay(new Date(2026, 8, 15)));
  });

  it("advances day to day and does not repeat within the library length", () => {
    const base = new Date(2026, 0, 1);
    const seen = new Set<number>();
    for (let i = 0; i < PUZZLES.length; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      seen.add(PUZZLES.indexOf(puzzleForDay(d)));
    }
    // Every day in one full cycle maps to a distinct puzzle.
    expect(seen.size).toBe(PUZZLES.length);
  });

  it("dayNumber increases by 1 per calendar day", () => {
    const a = dayNumber(new Date(2026, 0, 1));
    const b = dayNumber(new Date(2026, 0, 2));
    expect(b - a).toBe(1);
  });
});
