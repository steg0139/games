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

// A deterministic shuffle of puzzle indices so the daily order is well-mixed
// (not 0,1,2,…) but identical for everyone. Seeded, computed once.
function seededOrder(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  // xmur-style seeded PRNG.
  let seed = 0x9e3779b9;
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

const ORDER = seededOrder(PUZZLES.length);

/** The puzzle for a given day: walks a shuffled order over the full library,
 *  so consecutive days feel varied and it only repeats after the whole set
 *  cycles (~PUZZLES.length days). */
export function puzzleForDay(date: Date = new Date()): Puzzle {
  const d = dayNumber(date);
  const idx = ((d % ORDER.length) + ORDER.length) % ORDER.length;
  return PUZZLES[ORDER[idx]];
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
