import { describe, expect, it } from "vitest";
import { CELLS, conflictingCells, idx, isSolved } from "./logic";

/** Build an 81-cell grid from a map of index->value (rest 0). */
function grid(filled: Record<number, number> = {}): number[] {
  const g = new Array<number>(CELLS).fill(0);
  for (const [k, v] of Object.entries(filled)) g[Number(k)] = v;
  return g;
}

// A valid completed solution (bands shifted by 3, +1 each row of a band).
function validSolution(): number[] {
  const g = new Array<number>(CELLS).fill(0);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      g[r * 9 + c] = ((c + r * 3 + Math.floor(r / 3)) % 9) + 1;
    }
  }
  return g;
}

describe("idx", () => {
  it("maps (row, col) to row-major index", () => {
    expect(idx(0, 0)).toBe(0);
    expect(idx(0, 8)).toBe(8);
    expect(idx(1, 0)).toBe(9);
    expect(idx(8, 8)).toBe(80);
  });
});

describe("isSolved", () => {
  it("is true only when every cell matches the solution", () => {
    const sol = validSolution();
    expect(isSolved(sol.slice(), sol)).toBe(true);
  });

  it("is false when any cell is blank", () => {
    const sol = validSolution();
    const entries = sol.slice();
    entries[40] = 0;
    expect(isSolved(entries, sol)).toBe(false);
  });

  it("is false when a cell is filled with the wrong value", () => {
    const sol = validSolution();
    const entries = sol.slice();
    entries[0] = entries[0] === 1 ? 2 : 1;
    expect(isSolved(entries, sol)).toBe(false);
  });
});

describe("conflictingCells", () => {
  it("finds no conflicts in an empty grid", () => {
    expect(conflictingCells(grid()).size).toBe(0);
  });

  it("ignores blank (0) cells", () => {
    // Two blanks are not a conflict even though they're equal.
    expect(conflictingCells(grid()).size).toBe(0);
  });

  it("flags a duplicate in the same row", () => {
    // row 0: a 5 at col 0 and col 3.
    const bad = conflictingCells(grid({ [idx(0, 0)]: 5, [idx(0, 3)]: 5 }));
    expect(bad.has(idx(0, 0))).toBe(true);
    expect(bad.has(idx(0, 3))).toBe(true);
    expect(bad.size).toBe(2);
  });

  it("flags a duplicate in the same column", () => {
    const bad = conflictingCells(grid({ [idx(0, 2)]: 7, [idx(5, 2)]: 7 }));
    expect(bad.has(idx(0, 2))).toBe(true);
    expect(bad.has(idx(5, 2))).toBe(true);
  });

  it("flags a duplicate in the same 3x3 box", () => {
    // Both in the top-left box, different row AND column.
    const bad = conflictingCells(grid({ [idx(0, 0)]: 9, [idx(1, 1)]: 9 }));
    expect(bad.has(idx(0, 0))).toBe(true);
    expect(bad.has(idx(1, 1))).toBe(true);
  });

  it("does not flag equal values in different row, col, and box", () => {
    // (0,0) and (4,4): different row, col, and box.
    expect(conflictingCells(grid({ [idx(0, 0)]: 3, [idx(4, 4)]: 3 })).size).toBe(0);
  });

  it("a valid full solution has zero conflicts", () => {
    expect(conflictingCells(validSolution()).size).toBe(0);
  });
});
