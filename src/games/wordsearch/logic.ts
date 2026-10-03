// Word Search data shapes (the backend generates puzzles; the frontend renders
// and validates the player's selections). The grid is `size` rows of `size`
// uppercase letters.

export interface Placement {
  word: string;
  row: number;
  col: number;
  dr: number; // row step (-1, 0, 1)
  dc: number; // col step (-1, 0, 1)
}

export interface WordSearchPuzzle {
  size: number;
  grid: string[]; // `size` strings, each `size` chars
  words: string[];
  placements: Placement[];
}

/** Letter at (row, col). */
export function letterAt(puzzle: WordSearchPuzzle, row: number, col: number): string {
  return puzzle.grid[row]?.[col] ?? "";
}

/**
 * The straight line of cell indices (row*size+col) from `start` to `end`, if
 * they form a valid word-search line (horizontal, vertical, or diagonal).
 * Returns null if the two cells aren't on one of the 8 straight lines.
 */
export function lineBetween(
  size: number,
  start: { row: number; col: number },
  end: { row: number; col: number },
): number[] | null {
  const dRow = end.row - start.row;
  const dCol = end.col - start.col;
  const stepR = Math.sign(dRow);
  const stepC = Math.sign(dCol);
  const lenR = Math.abs(dRow);
  const lenC = Math.abs(dCol);
  // Valid only if horizontal (lenR 0), vertical (lenC 0), or perfect diagonal.
  const straight =
    (lenR === 0 && lenC > 0) ||
    (lenC === 0 && lenR > 0) ||
    (lenR === lenC && lenR > 0) ||
    (lenR === 0 && lenC === 0);
  if (!straight) return null;
  const steps = Math.max(lenR, lenC);
  const cells: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const r = start.row + stepR * i;
    const c = start.col + stepC * i;
    cells.push(r * size + c);
  }
  return cells;
}

/** Read the string spelled by a line of cell indices. */
export function wordFromCells(puzzle: WordSearchPuzzle, cells: number[]): string {
  return cells
    .map((idx) => {
      const r = Math.floor(idx / puzzle.size);
      const c = idx % puzzle.size;
      return letterAt(puzzle, r, c);
    })
    .join("");
}

/**
 * If `cells` spells one of the puzzle's words (forward or backward) and that
 * word hasn't been found yet, return the word; else null.
 */
export function matchWord(
  puzzle: WordSearchPuzzle,
  cells: number[],
  found: Set<string>,
): string | null {
  const forward = wordFromCells(puzzle, cells);
  const backward = forward.split("").reverse().join("");
  for (const candidate of [forward, backward]) {
    if (puzzle.words.includes(candidate) && !found.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** All cell indices covered by a found placement (for persistent highlight). */
export function placementCells(
  puzzle: WordSearchPuzzle,
  word: string,
): number[] {
  const p = puzzle.placements.find((pl) => pl.word === word);
  if (!p) return [];
  const cells: number[] = [];
  for (let i = 0; i < word.length; i++) {
    cells.push((p.row + p.dr * i) * puzzle.size + (p.col + p.dc * i));
  }
  return cells;
}
