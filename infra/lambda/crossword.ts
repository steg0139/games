// Crossword API + nightly generator.
//   GET /crossword/today   -> today's canonical puzzle (same for everyone),
//                             generated on-demand if not already stored.
//   GET /crossword/random  -> a random puzzle (for practice; not stored).
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
import clg from "crossword-layout-generator";
import wordPool from "./word-pool.json";

const TABLE_NAME = process.env.TABLE_NAME!;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const generateLayout =
  (clg as unknown as { generateLayout?: typeof genFn }).generateLayout ??
  (clg as unknown as typeof genFn);

const WORDS_PER_PUZZLE = 16;
const MIN_PLACED = 10;
const NO_REPEAT_DAYS = 60; // don't reuse a word within this many days

interface WordClue {
  answer: string;
  clue: string;
}
type Pool = WordClue[];
const POOL = wordPool as Pool;

interface LayoutItem {
  clue: string;
  answer: string;
  startx: number;
  starty: number;
  orientation: "across" | "down" | "none";
  position: number;
}
type genFn = (input: WordClue[]) => { rows: number; cols: number; result: LayoutItem[] };

interface PuzzleCell {
  clue: string;
  answer: string;
  row: number;
  col: number;
}
interface Puzzle {
  across: Record<number, PuzzleCell>;
  down: Record<number, PuzzleCell>;
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

// Deterministic PRNG (mulberry32) so a given seed always yields the same puzzle.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a puzzle deterministically from a numeric seed, drawing only from words
 * not in `exclude` (the words used in the last NO_REPEAT_DAYS). Returns the
 * puzzle and the set of answer words it actually used (to record for future
 * exclusion). If the available pool is somehow too small, falls back to the
 * full pool so we never fail to produce a puzzle.
 */
function generatePuzzle(
  seed: number,
  exclude: Set<string>,
): { puzzle: Puzzle; words: string[] } {
  const rand = mulberry32(seed);
  const available = POOL.filter((w) => !exclude.has(w.answer));
  const usable = available.length >= WORDS_PER_PUZZLE * 3 ? available : POOL;

  for (let attempt = 0; attempt < 60; attempt++) {
    const shuffled = usable.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const words = shuffled.slice(0, WORDS_PER_PUZZLE);
    const layout = generateLayout(
      words.map((w) => ({ clue: w.clue, answer: w.answer.toUpperCase() })),
    );
    const placed = layout.result.filter((r) => r.orientation !== "none");
    if (placed.length < MIN_PLACED) continue;

    const across: Record<number, PuzzleCell> = {};
    const down: Record<number, PuzzleCell> = {};
    const used: string[] = [];
    for (const item of placed) {
      const answer = item.answer.toUpperCase();
      used.push(answer);
      const cell: PuzzleCell = {
        clue: item.clue,
        answer,
        row: item.starty - 1,
        col: item.startx - 1,
      };
      if (item.orientation === "across") across[item.position] = cell;
      else down[item.position] = cell;
    }
    return { puzzle: { across, down }, words: used };
  }
  return { puzzle: { across: {}, down: {} }, words: [] };
}

// The daily puzzle rolls over at midnight America/Chicago (Central) for
// everyone. The frontend (src/games/crossword/client.ts) uses the identical
// rule so the date keys match. The IANA zone tracks CST/CDT automatically.
const DAILY_TIME_ZONE = "America/Chicago";

/** The canonical daily key (YYYY-MM-DD) for the given instant, in Central. */
function dateKey(d = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * A stable integer that increments by exactly 1 each Central calendar day,
 * derived from the Central date string. Used as the puzzle seed and as the
 * index for the no-repeat window. Converting the Central date back through
 * UTC-midnight keeps consecutive days one apart regardless of DST.
 */
function dayNumber(d = new Date()): number {
  return Math.floor(Date.parse(`${dateKey(d)}T00:00:00Z`) / 86_400_000);
}

/** The Central date string for a given day-number (inverse of dayNumber). */
function dateKeyFromDayNumber(dayNum: number): string {
  return new Date(dayNum * 86_400_000).toISOString().slice(0, 10);
}

interface StoredDay {
  puzzle: Puzzle;
  words: string[];
}

async function getStored(date: string): Promise<StoredDay | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: `CROSSWORD#${date}`, SK: "PUZZLE" } }),
  );
  if (!res.Item?.puzzle) return null;
  return { puzzle: res.Item.puzzle as Puzzle, words: (res.Item.words as string[]) ?? [] };
}

async function storeDay(date: string, day: StoredDay): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: `CROSSWORD#${date}`, SK: "PUZZLE", date, ...day },
    }),
  );
}

/** Words used across the NO_REPEAT_DAYS days before `beforeDayNum`, to exclude.
 *  Day-numbers map back to the same Central date keys used when storing. */
async function recentWords(beforeDayNum: number): Promise<Set<string>> {
  const used = new Set<string>();
  // Read each prior day's stored puzzle (cheap point reads; ~60 of them).
  const reads: Promise<StoredDay | null>[] = [];
  for (let i = 1; i <= NO_REPEAT_DAYS; i++) {
    reads.push(getStored(dateKeyFromDayNumber(beforeDayNum - i)));
  }
  for (const day of await Promise.all(reads)) {
    if (day) for (const w of day.words) used.add(w);
  }
  return used;
}

/** Get (or generate+store) the canonical puzzle for today. */
async function todaysPuzzle(): Promise<{ date: string; puzzle: Puzzle }> {
  const date = dateKey();
  const existing = await getStored(date);
  if (existing) return { date, puzzle: existing.puzzle };

  const dayNum = dayNumber();
  const exclude = await recentWords(dayNum);
  // Seed by the UTC day number so on-demand and cron produce the same puzzle
  // (both see the same prior-60-day exclusion set once the day has started).
  const { puzzle, words } = generatePuzzle(dayNum, exclude);
  await storeDay(date, { puzzle, words });
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
    if (path.endsWith("/crossword/random")) {
      // Practice: a fresh random puzzle, not stored, no exclusions.
      const { puzzle } = generatePuzzle(
        Math.floor(Math.random() * 2 ** 31),
        new Set(),
      );
      return json(200, { date: null, puzzle });
    }
    // Default: today's canonical puzzle.
    const { date, puzzle } = await todaysPuzzle();
    return json(200, { date, puzzle });
  } catch (err) {
    console.error("crossword handler error", err);
    return json(500, { message: "Internal error." });
  }
};

// EventBridge cron handler: pre-generate today's puzzle.
export const scheduled = async (): Promise<void> => {
  await todaysPuzzle();
};
