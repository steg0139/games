import { describe, expect, it } from "vitest";
import {
  type WordSearchPuzzle,
  letterAt,
  lineBetween,
  matchWord,
  placementCells,
  wordFromCells,
} from "./logic";

// A 4x4 puzzle:
//   C A T S
//   O X X X
//   W X X X
//   X X X D   (DOG placed diagonally from (1,1)? see below)
// We place:
//   CAT  across at row 0, col 0  (dr 0, dc 1)
//   COW  down   at col 0, row 0  (dr 1, dc 0)  -> C,O,W
//   DOG  diagonal... let's craft letters explicitly.
// Build the grid letter-by-letter to match placements exactly.
function makePuzzle(): WordSearchPuzzle {
  const size = 4;
  // row-major letters
  const g = [
    ["C", "A", "T", "Z"],
    ["O", "D", "Z", "Z"],
    ["W", "Z", "O", "Z"],
    ["Z", "Z", "Z", "G"],
  ];
  const grid = g.map((row) => row.join(""));
  return {
    size,
    grid,
    words: ["CAT", "COW", "DOG"],
    placements: [
      { word: "CAT", row: 0, col: 0, dr: 0, dc: 1 }, // C(0,0) A(0,1) T(0,2)
      { word: "COW", row: 0, col: 0, dr: 1, dc: 0 }, // C(0,0) O(1,0) W(2,0)
      { word: "DOG", row: 1, col: 1, dr: 1, dc: 1 }, // D(1,1) O(2,2) G(3,3)
    ],
  };
}

const P = makePuzzle();
const cell = (r: number, c: number) => r * P.size + c;

describe("letterAt", () => {
  it("returns the letter at a position", () => {
    expect(letterAt(P, 0, 0)).toBe("C");
    expect(letterAt(P, 3, 3)).toBe("G");
  });
  it("returns empty string out of bounds", () => {
    expect(letterAt(P, 9, 9)).toBe("");
  });
});

describe("lineBetween", () => {
  it("builds a horizontal line", () => {
    expect(lineBetween(4, { row: 0, col: 0 }, { row: 0, col: 2 })).toEqual([
      cell(0, 0),
      cell(0, 1),
      cell(0, 2),
    ]);
  });

  it("builds a vertical line", () => {
    expect(lineBetween(4, { row: 0, col: 0 }, { row: 2, col: 0 })).toEqual([
      cell(0, 0),
      cell(1, 0),
      cell(2, 0),
    ]);
  });

  it("builds a diagonal line", () => {
    expect(lineBetween(4, { row: 1, col: 1 }, { row: 3, col: 3 })).toEqual([
      cell(1, 1),
      cell(2, 2),
      cell(3, 3),
    ]);
  });

  it("builds a reversed (up-left) diagonal", () => {
    expect(lineBetween(4, { row: 3, col: 3 }, { row: 1, col: 1 })).toEqual([
      cell(3, 3),
      cell(2, 2),
      cell(1, 1),
    ]);
  });

  it("returns a single cell when start === end", () => {
    expect(lineBetween(4, { row: 2, col: 2 }, { row: 2, col: 2 })).toEqual([
      cell(2, 2),
    ]);
  });

  it("returns null for a non-straight (knight-ish) move", () => {
    expect(lineBetween(4, { row: 0, col: 0 }, { row: 1, col: 2 })).toBeNull();
    expect(lineBetween(4, { row: 0, col: 0 }, { row: 2, col: 3 })).toBeNull();
  });
});

describe("wordFromCells", () => {
  it("reads the letters along a line", () => {
    const cells = lineBetween(4, { row: 0, col: 0 }, { row: 0, col: 2 })!;
    expect(wordFromCells(P, cells)).toBe("CAT");
  });
});

describe("matchWord", () => {
  it("matches a word read forward", () => {
    const cells = lineBetween(4, { row: 0, col: 0 }, { row: 0, col: 2 })!;
    expect(matchWord(P, cells, new Set())).toBe("CAT");
  });

  it("matches a word read backward (reverse selection)", () => {
    // Select T->A->C; the forward string is "TAC", backward "CAT".
    const cells = lineBetween(4, { row: 0, col: 2 }, { row: 0, col: 0 })!;
    expect(matchWord(P, cells, new Set())).toBe("CAT");
  });

  it("matches a diagonal word", () => {
    const cells = lineBetween(4, { row: 1, col: 1 }, { row: 3, col: 3 })!;
    expect(matchWord(P, cells, new Set())).toBe("DOG");
  });

  it("returns null for a non-word selection", () => {
    const cells = lineBetween(4, { row: 0, col: 1 }, { row: 0, col: 3 })!; // "ATZ"
    expect(matchWord(P, cells, new Set())).toBeNull();
  });

  it("returns null if the word was already found", () => {
    const cells = lineBetween(4, { row: 0, col: 0 }, { row: 0, col: 2 })!;
    expect(matchWord(P, cells, new Set(["CAT"]))).toBeNull();
  });
});

describe("placementCells", () => {
  it("returns the cells a word occupies (horizontal)", () => {
    expect(placementCells(P, "CAT")).toEqual([cell(0, 0), cell(0, 1), cell(0, 2)]);
  });
  it("returns the cells a word occupies (diagonal)", () => {
    expect(placementCells(P, "DOG")).toEqual([cell(1, 1), cell(2, 2), cell(3, 3)]);
  });
  it("returns [] for an unknown word", () => {
    expect(placementCells(P, "FISH")).toEqual([]);
  });
});
