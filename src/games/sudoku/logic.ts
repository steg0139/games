// Sudoku data shapes (the backend generates puzzles; the frontend only renders
// and validates). Grids are 81-cell row-major arrays, values 0-9 (0 = blank).

export type SudokuDifficulty = "easy" | "regular";

export interface SudokuPuzzle {
  givens: number[]; // 81 cells, 0 = blank (player fills these)
  solution: number[]; // 81 cells, the unique completed grid
}

export const SIZE = 9;
export const CELLS = 81;

/** Row-major index for (row, col). */
export function idx(row: number, col: number): number {
  return row * SIZE + col;
}

/** True once every cell matches the solution. */
export function isSolved(entries: number[], solution: number[]): boolean {
  for (let i = 0; i < CELLS; i++) {
    if (entries[i] !== solution[i]) return false;
  }
  return true;
}

/**
 * Indices that conflict with a filled peer (same row, col, or 3x3 box sharing
 * the same value). Used to highlight mistakes. Only considers filled cells.
 */
export function conflictingCells(entries: number[]): Set<number> {
  const bad = new Set<number>();
  const peersConflict = (a: number, b: number) => {
    if (a === b) return false;
    if (entries[a] === 0 || entries[b] === 0) return false;
    if (entries[a] !== entries[b]) return false;
    const ra = Math.floor(a / SIZE),
      ca = a % SIZE;
    const rb = Math.floor(b / SIZE),
      cb = b % SIZE;
    if (ra === rb) return true;
    if (ca === cb) return true;
    const sameBox =
      Math.floor(ra / 3) === Math.floor(rb / 3) &&
      Math.floor(ca / 3) === Math.floor(cb / 3);
    return sameBox;
  };
  for (let a = 0; a < CELLS; a++) {
    for (let b = a + 1; b < CELLS; b++) {
      if (peersConflict(a, b)) {
        bad.add(a);
        bad.add(b);
      }
    }
  }
  return bad;
}
