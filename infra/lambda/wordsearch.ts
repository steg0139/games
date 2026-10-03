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

const TABLE_NAME = process.env.TABLE_NAME!;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const GRID_SIZE = 12; // 12x12 letter grid
const WORD_COUNT = 10; // words hidden per puzzle
const MIN_WORD_LEN = 4;
const MAX_WORD_LEN = 10; // must fit within GRID_SIZE
const NO_REPEAT_DAYS = 30;

// Reuse the crossword word pool's answers as a clean source of common words.
const ALL_WORDS: string[] = Array.from(
  new Set(
    (wordPool as { answer: string }[])
      .map((w) => w.answer.toUpperCase())
      .filter((w) => /^[A-Z]+$/.test(w) && w.length >= MIN_WORD_LEN && w.length <= MAX_WORD_LEN),
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
  grid: string[]; // GRID_SIZE rows of GRID_SIZE letters
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
 * Try to place `word` into `grid` (GRID_SIZE x GRID_SIZE, 0 = empty) in a
 * seeded-random position/direction. A placement is legal if every cell is
 * on-grid and either empty or already holds the same letter (overlaps are OK).
 * Returns the placement, or null if no legal spot was found in the tries.
 */
function placeWord(
  grid: string[],
  word: string,
  rand: () => number,
): Placement | null {
  const n = GRID_SIZE;
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
 * Build a word-search deterministically from `seed`, avoiding words in
 * `exclude`. Places WORD_COUNT words, fills the rest with random letters.
 */
function generatePuzzle(
  seed: number,
  exclude: Set<string>,
): WordSearchPuzzle {
  const rand = mulberry32(seed);
  const n = GRID_SIZE;

  const candidates = shuffle(
    ALL_WORDS.filter((w) => !exclude.has(w)),
    rand,
  );
  const usable = candidates.length >= WORD_COUNT * 3 ? candidates : shuffle(ALL_WORDS, rand);

  const grid = new Array<string>(n * n).fill("");
  const placements: Placement[] = [];
  const words: string[] = [];

  for (const word of usable) {
    if (words.length >= WORD_COUNT) break;
    if (words.includes(word)) continue;
    const placement = placeWord(grid, word, rand);
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

// --- Storage (shared ProfileTable; PK=WORDSEARCH#<date>, SK=PUZZLE) --------

async function getStored(date: string): Promise<WordSearchPuzzle | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `WORDSEARCH#${date}`, SK: "PUZZLE" },
    }),
  );
  return (res.Item?.puzzle as WordSearchPuzzle) ?? null;
}

async function storeDay(date: string, puzzle: WordSearchPuzzle): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: `WORDSEARCH#${date}`, SK: "PUZZLE", date, puzzle },
    }),
  );
}

/** Words used across the NO_REPEAT_DAYS days before `beforeDayNum`. */
async function recentWords(beforeDayNum: number): Promise<Set<string>> {
  const used = new Set<string>();
  const reads: Promise<WordSearchPuzzle | null>[] = [];
  for (let i = 1; i <= NO_REPEAT_DAYS; i++) {
    reads.push(getStored(dateKeyFromDayNumber(beforeDayNum - i)));
  }
  for (const p of await Promise.all(reads)) {
    if (p) for (const w of p.words) used.add(w);
  }
  return used;
}

async function todaysPuzzle(
  force = false,
): Promise<{ date: string; puzzle: WordSearchPuzzle }> {
  const date = dateKey();
  if (!force) {
    const existing = await getStored(date);
    if (existing) return { date, puzzle: existing };
  }
  const dayNum = dayNumber();
  const exclude = await recentWords(dayNum);
  const puzzle = generatePuzzle(dayNum, exclude);
  await storeDay(date, puzzle);
  return { date, puzzle };
}

// HTTP handler.
export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext?.http?.method ?? "GET";
  if (method === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  const path = event.requestContext?.http?.path ?? event.rawPath ?? "";
  try {
    if (path.endsWith("/wordsearch/random")) {
      const puzzle = generatePuzzle(
        Math.floor(Math.random() * 2 ** 31),
        new Set(),
      );
      return json(200, { date: null, puzzle });
    }
    const force = event.queryStringParameters?.force != null;
    const { date, puzzle } = await todaysPuzzle(force);
    return json(200, { date, puzzle, ...(force ? { regenerated: true } : {}) });
  } catch (err) {
    console.error("wordsearch handler error", err);
    return json(500, { message: "Internal error." });
  }
};

// EventBridge cron: pre-generate today's puzzle.
export const scheduled = async (): Promise<void> => {
  await todaysPuzzle();
};
