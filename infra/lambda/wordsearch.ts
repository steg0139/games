// Daily Word Search API + nightly generator.
//   GET /wordsearch/today  -> today's canonical puzzle (same for everyone).
//   GET /wordsearch/random -> a random practice puzzle (not stored).
// The EventBridge cron invokes `scheduled` nightly to pre-generate the day's
// puzzle so the first user of the day gets a cache hit.
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
import wordPool from "./word-pool.json";
import { isBlockedWord } from "./word-blocklist";

const TABLE_NAME = process.env.TABLE_NAME!;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type Difficulty = "easy" | "medium" | "hard";

// Grid size + word count per difficulty. Bigger grid = harder. maxWordLen is
// capped to the grid size so words always fit.
interface DiffConfig {
  size: number;
  wordCount: number;
  minWordLen: number;
  maxWordLen: number;
}
const DIFFICULTY: Record<Difficulty, DiffConfig> = {
  easy: { size: 8, wordCount: 6, minWordLen: 3, maxWordLen: 7 },
  medium: { size: 12, wordCount: 10, minWordLen: 4, maxWordLen: 10 },
  hard: { size: 15, wordCount: 14, minWordLen: 4, maxWordLen: 12 },
};

const NO_REPEAT_DAYS = 30;

// All clean candidate words from the crossword pool (3-12 letters). The
// per-difficulty length window is applied when building each puzzle.
const ALL_WORDS: string[] = Array.from(
  new Set(
    (wordPool as { answer: string }[])
      .map((w) => w.answer.toUpperCase())
      .filter((w) => /^[A-Z]+$/.test(w) && w.length >= 3 && w.length <= 12)
      // Runtime safety net on top of the build-time filter.
      .filter((w) => !isBlockedWord(w)),
  ),
);

/** 8 directions as [dr, dc]. */
const DIRECTIONS: [number, number][] = [
  [0, 1], // →
  [0, -1], // ←
  [1, 0], // ↓
  [-1, 0], // ↑
  [1, 1], // ↘
  [1, -1], // ↙
  [-1, 1], // ↗
  [-1, -1], // ↖
];

interface Placement {
  word: string;
  row: number;
  col: number;
  dr: number;
  dc: number;
}
interface WordSearchPuzzle {
  size: number;
  grid: string[]; // `size` rows of `size` letters
  words: string[];
  placements: Placement[]; // where each word is (for the reveal / validation)
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

/**
 * Try to place `word` into an `n`x`n` `grid` ("" = empty) in a seeded-random
 * position/direction. A placement is legal if every cell is on-grid and either
 * empty or already holds the same letter (overlaps are OK). Returns the
 * placement, or null if no legal spot was found in the tries.
 */
function placeWord(
  grid: string[],
  n: number,
  word: string,
  rand: () => number,
): Placement | null {
  for (let attempt = 0; attempt < 100; attempt++) {
    const [dr, dc] = DIRECTIONS[Math.floor(rand() * DIRECTIONS.length)];
    const row = Math.floor(rand() * n);
    const col = Math.floor(rand() * n);
    const endR = row + dr * (word.length - 1);
    const endC = col + dc * (word.length - 1);
    if (endR < 0 || endR >= n || endC < 0 || endC >= n) continue;

    let ok = true;
    for (let i = 0; i < word.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const existing = grid[r * n + c];
      if (existing !== "" && existing !== word[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    for (let i = 0; i < word.length; i++) {
      grid[(row + dr * i) * n + (col + dc * i)] = word[i];
    }
    return { word, row, col, dr, dc };
  }
  return null;
}

/**
 * Build a word-search deterministically from `seed` for `difficulty`, avoiding
 * words in `exclude`. Grid size and word count come from the difficulty config;
 * words are length-filtered to fit the grid. Fills leftover cells with random
 * letters.
 */
function generatePuzzle(
  seed: number,
  difficulty: Difficulty,
  exclude: Set<string>,
): WordSearchPuzzle {
  const rand = mulberry32(seed);
  const cfg = DIFFICULTY[difficulty];
  const n = cfg.size;

  const lengthOk = (w: string) =>
    w.length >= cfg.minWordLen && w.length <= cfg.maxWordLen;
  const pool = ALL_WORDS.filter(lengthOk);
  const candidates = shuffle(
    pool.filter((w) => !exclude.has(w)),
    rand,
  );
  const usable =
    candidates.length >= cfg.wordCount * 3 ? candidates : shuffle(pool, rand);

  const grid = new Array<string>(n * n).fill("");
  const placements: Placement[] = [];
  const words: string[] = [];

  for (const word of usable) {
    if (words.length >= cfg.wordCount) break;
    if (words.includes(word)) continue;
    const placement = placeWord(grid, n, word, rand);
    if (placement) {
      placements.push(placement);
      words.push(word);
    }
  }

  // Fill empty cells with random letters.
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === "") grid[i] = A[Math.floor(rand() * 26)];
  }

  // Pack into row strings.
  const rows: string[] = [];
  for (let r = 0; r < n; r++) {
    rows.push(grid.slice(r * n, r * n + n).join(""));
  }

  return { size: n, grid: rows, words, placements };
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

function dateKeyFromDayNumber(dayNum: number): string {
  return new Date(dayNum * 86_400_000).toISOString().slice(0, 10);
}

// --- Storage (shared ProfileTable; PK=WORDSEARCH#<date>, SK=PUZZLE#<DIFF>) --

function skFor(difficulty: Difficulty): string {
  return `PUZZLE#${difficulty.toUpperCase()}`;
}

async function getStored(
  date: string,
  difficulty: Difficulty,
): Promise<WordSearchPuzzle | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `WORDSEARCH#${date}`, SK: skFor(difficulty) },
    }),
  );
  return (res.Item?.puzzle as WordSearchPuzzle) ?? null;
}

async function storeDay(
  date: string,
  difficulty: Difficulty,
  puzzle: WordSearchPuzzle,
): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `WORDSEARCH#${date}`,
        SK: skFor(difficulty),
        date,
        difficulty,
        puzzle,
      },
    }),
  );
}

/** Words used in this difficulty across the NO_REPEAT_DAYS days before
 *  `beforeDayNum` (per-difficulty so each track avoids its own repeats). */
async function recentWords(
  beforeDayNum: number,
  difficulty: Difficulty,
): Promise<Set<string>> {
  const used = new Set<string>();
  const reads: Promise<WordSearchPuzzle | null>[] = [];
  for (let i = 1; i <= NO_REPEAT_DAYS; i++) {
    reads.push(getStored(dateKeyFromDayNumber(beforeDayNum - i), difficulty));
  }
  for (const p of await Promise.all(reads)) {
    if (p) for (const w of p.words) used.add(w);
  }
  return used;
}

/** Distinct seed per day AND difficulty so the three puzzles differ. */
function seedFor(dayNum: number, difficulty: Difficulty): number {
  const offset = difficulty === "easy" ? 0 : difficulty === "medium" ? 1 : 2;
  return dayNum * 3 + offset;
}

async function todaysPuzzle(
  difficulty: Difficulty,
  force = false,
): Promise<{ date: string; difficulty: Difficulty; puzzle: WordSearchPuzzle }> {
  const date = dateKey();
  if (!force) {
    const existing = await getStored(date, difficulty);
    if (existing) return { date, difficulty, puzzle: existing };
  }
  const dayNum = dayNumber();
  const exclude = await recentWords(dayNum, difficulty);
  const puzzle = generatePuzzle(seedFor(dayNum, difficulty), difficulty, exclude);
  await storeDay(date, difficulty, puzzle);
  return { date, difficulty, puzzle };
}

function parseDifficulty(v: string | undefined): Difficulty {
  return v === "easy" ? "easy" : v === "hard" ? "hard" : "medium";
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
    if (path.endsWith("/wordsearch/random")) {
      const puzzle = generatePuzzle(
        Math.floor(Math.random() * 2 ** 31),
        difficulty,
        new Set(),
      );
      return json(200, { date: null, difficulty, puzzle });
    }
    const force = event.queryStringParameters?.force != null;
    const res = await todaysPuzzle(difficulty, force);
    return json(200, { ...res, ...(force ? { regenerated: true } : {}) });
  } catch (err) {
    console.error("wordsearch handler error", err);
    return json(500, { message: "Internal error." });
  }
};

// EventBridge cron: pre-generate all three difficulties for today.
export const scheduled = async (): Promise<void> => {
  await todaysPuzzle("easy");
  await todaysPuzzle("medium");
  await todaysPuzzle("hard");
};
