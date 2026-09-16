// Daily crossword logic: pick the day's puzzle deterministically and convert
// its word list into the data format react-crossword expects.
import generateLayout from "crossword-layout-generator";
import { PUZZLES, type Puzzle } from "./puzzles";

// react-crossword's input shape.
export interface CrosswordCell {
  clue: string;
  answer: string;
  row: number; // 0-based
  col: number; // 0-based
}
export interface CrosswordData {
  across: Record<number, CrosswordCell>;
  down: Record<number, CrosswordCell>;
}

/** Days since the Unix epoch in local time — the "daily" index. */
export function dayNumber(date: Date = new Date()): number {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(local.getTime() / 86_400_000);
}

/** A stable id string for today's puzzle (used as the save key). */
export function dailyId(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** The puzzle for a given day, rotating through the library. */
export function puzzleForDay(date: Date = new Date()): Puzzle {
  const idx = ((dayNumber(date) % PUZZLES.length) + PUZZLES.length) % PUZZLES.length;
  return PUZZLES[idx];
}

interface LayoutItem {
  clue: string;
  answer: string;
  startx: number; // 1-based
  starty: number; // 1-based
  orientation: "across" | "down" | "none";
  position: number;
}
interface Layout {
  rows: number;
  cols: number;
  result: LayoutItem[];
}

// The layout generator's default export can be the function or a module object.
const layoutFn: (input: { clue: string; answer: string }[]) => Layout =
  (generateLayout as unknown as { generateLayout?: typeof layoutFn })
    .generateLayout ?? (generateLayout as unknown as typeof layoutFn);

/**
 * Build react-crossword data for a puzzle. Words the generator couldn't place
 * (orientation "none") are dropped. Returns the data plus the placed count so
 * the caller can note if any words were omitted.
 */
export function buildCrosswordData(puzzle: Puzzle): {
  data: CrosswordData;
  placed: number;
  total: number;
} {
  const layout = layoutFn(
    puzzle.words.map((w) => ({ clue: w.clue, answer: w.answer.toUpperCase() })),
  );

  const across: Record<number, CrosswordCell> = {};
  const down: Record<number, CrosswordCell> = {};
  let placed = 0;

  for (const item of layout.result) {
    if (item.orientation === "none") continue;
    placed++;
    const cell: CrosswordCell = {
      clue: item.clue,
      answer: item.answer.toUpperCase(),
      row: item.starty - 1,
      col: item.startx - 1,
    };
    if (item.orientation === "across") across[item.position] = cell;
    else down[item.position] = cell;
  }

  return { data: { across, down }, placed, total: puzzle.words.length };
}
