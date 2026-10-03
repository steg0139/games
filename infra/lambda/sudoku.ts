// Daily Sudoku API + nightly generator.
//   GET /sudoku/today?difficulty=easy|regular -> today's canonical puzzle for
//        that difficulty (same for everyone), generated on-demand if absent.
//   GET /sudoku/random?difficulty=easy|regular -> a random practice puzzle.
// Two puzzles are generated per day (easy + regular) and stored separately.
// The EventBridge cron invokes `scheduled` nightly to pre-generate both.
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME!;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type Difficulty = "easy" | "regular";
// Number of givens (filled cells) left in the puzzle. More givens = easier.
const GIVENS: Record<Difficulty, number> = { easy: 40, regular: 30 };

/** A puzzle: the givens grid (0 = blank) and the full solution. 81 cells each,
 *  row-major, values 0-9. */
interface SudokuPuzzle {
  givens: number[];
  solution: number[];
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(status: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: { "content-type": "application/json", ...CORS },
    body: JSON.stringify(body),
  };
}

// Deterministic PRNG (mulberry32): a given seed always yields the same puzzle.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- Sudoku core ----------------------------------------------------------

/** Can `val` go at index `pos` (row-major 0..80) in `grid` without conflict? */
function canPlace(grid: number[], pos: number, val: number): boolean {
  const row = Math.floor(pos / 9);
  const col = pos % 9;
  for (let i = 0; i < 9; i++) {
    if (grid[row * 9 + i] === val) return false; // row
    if (grid[i * 9 + col] === val) return false; // col
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (grid[(br + r) * 9 + (bc + c)] === val) return false; // 3x3 box
    }
  }
  return true;
}

/** Fill an empty grid with a complete valid solution via randomized backtracking. */
function fillGrid(grid: number[], rand: () => number): boolean {
  const pos = grid.indexOf(0);
  if (pos === -1) return true; // full
  for (const val of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand)) {
    if (canPlace(grid, pos, val)) {
      grid[pos] = val;
      if (fillGrid(grid, rand)) return true;
      grid[pos] = 0;
    }
  }
  return false;
}

/**
 * Count solutions up to a cap (2 is enough to test uniqueness). Backtracking
 * over the first empty cell each step.
 */
function countSolutions(grid: number[], cap: number): number {
  const pos = grid.indexOf(0);
  if (pos === -1) return 1;
  let count = 0;
  for (let val = 1; val <= 9; val++) {
    if (canPlace(grid, pos, val)) {
      grid[pos] = val;
      count += countSolutions(grid, cap);
      grid[pos] = 0;
      if (count >= cap) break; // no need to count further
    }
  }
  return count;
}

/**
 * Build a puzzle for `difficulty` deterministically from `seed`: generate a
 * full solution, then remove cells (in a seeded order) as long as the puzzle
 * stays uniquely solvable, until we hit the target given-count (or run out of
 * safely-removable cells). Removal preserves a unique solution, so every daily
 * is fair.
 */
function generatePuzzle(seed: number, difficulty: Difficulty): SudokuPuzzle {
  const rand = mulberry32(seed);

  const solution = new Array<number>(81).fill(0);
  fillGrid(solution, rand);

  const givens = solution.slice();
  const target = GIVENS[difficulty];
  let filled = 81;

  // Try to remove cells in a shuffled order; keep a removal only if the puzzle
  // remains uniquely solvable.
  for (const pos of shuffle(
    Array.from({ length: 81 }, (_, i) => i),
    rand,
  )) {
    if (filled <= target) break;
    const saved = givens[pos];
    if (saved === 0) continue;
    givens[pos] = 0;
    // Uniqueness test on a copy (countSolutions mutates in place).
    if (countSolutions(givens.slice(), 2) !== 1) {
      givens[pos] = saved; // removing it created ambiguity — put it back
    } else {
      filled--;
    }
  }

  return { givens, solution };
}

// --- Daily keying (midnight America/Chicago, matching the crossword) -------

const DAILY_TIME_ZONE = "America/Chicago";

function dateKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function dayNumber(d = new Date()): number {
  return Math.floor(Date.parse(`${dateKey(d)}T00:00:00Z`) / 86_400_000);
}

// --- Storage (shared ProfileTable; PK=SUDOKU#<date>, SK=PUZZLE#<DIFF>) -----

function skFor(difficulty: Difficulty): string {
  return `PUZZLE#${difficulty.toUpperCase()}`;
}

async function getStored(
  date: string,
  difficulty: Difficulty,
): Promise<SudokuPuzzle | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `SUDOKU#${date}`, SK: skFor(difficulty) },
    }),
  );
  if (!res.Item?.puzzle) return null;
  return res.Item.puzzle as SudokuPuzzle;
}

async function storeDay(
  date: string,
  difficulty: Difficulty,
  puzzle: SudokuPuzzle,
): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: `SUDOKU#${date}`, SK: skFor(difficulty), date, difficulty, puzzle },
    }),
  );
}

/** Distinct seed per day AND difficulty so easy/regular differ. */
function seedFor(dayNum: number, difficulty: Difficulty): number {
  // Offset the regular seed so the two puzzles aren't derived from the same
  // solution grid.
  return dayNum * 2 + (difficulty === "regular" ? 1 : 0);
}

async function todaysPuzzle(
  difficulty: Difficulty,
  force = false,
): Promise<{ date: string; difficulty: Difficulty; puzzle: SudokuPuzzle }> {
  const date = dateKey();
  if (!force) {
    const existing = await getStored(date, difficulty);
    if (existing) return { date, difficulty, puzzle: existing };
  }
  const puzzle = generatePuzzle(seedFor(dayNumber(), difficulty), difficulty);
  await storeDay(date, difficulty, puzzle);
  return { date, difficulty, puzzle };
}

function parseDifficulty(v: string | undefined): Difficulty {
  return v === "easy" ? "easy" : "regular";
}

// HTTP handler.
export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext?.http?.method ?? "GET";
  if (method === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  const path = event.requestContext?.http?.path ?? event.rawPath ?? "";
  const difficulty = parseDifficulty(event.queryStringParameters?.difficulty);
  try {
    if (path.endsWith("/sudoku/random")) {
      const puzzle = generatePuzzle(
        Math.floor(Math.random() * 2 ** 31),
        difficulty,
      );
      return json(200, { date: null, difficulty, puzzle });
    }
    const force = event.queryStringParameters?.force != null;
    const res = await todaysPuzzle(difficulty, force);
    return json(200, { ...res, ...(force ? { regenerated: true } : {}) });
  } catch (err) {
    console.error("sudoku handler error", err);
    return json(500, { message: "Internal error." });
  }
};

// EventBridge cron: pre-generate both difficulties for today.
export const scheduled = async (): Promise<void> => {
  await todaysPuzzle("easy");
  await todaysPuzzle("regular");
};
