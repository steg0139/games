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

/** Build a puzzle deterministically from a numeric seed. */
function generatePuzzle(seed: number): Puzzle {
  const rand = mulberry32(seed);
  for (let attempt = 0; attempt < 40; attempt++) {
    const shuffled = POOL.slice();
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
    for (const item of placed) {
      const cell: PuzzleCell = {
        clue: item.clue,
        answer: item.answer.toUpperCase(),
        row: item.starty - 1,
        col: item.startx - 1,
      };
      if (item.orientation === "across") across[item.position] = cell;
      else down[item.position] = cell;
    }
    return { across, down };
  }
  // Extremely unlikely; return a minimal puzzle rather than throw.
  return { across: {}, down: {} };
}

/** Days since the Unix epoch (UTC) — the canonical daily index. */
function dayNumberUTC(d = new Date()): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
}

function dateKey(d = new Date()): string {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

async function getStored(date: string): Promise<Puzzle | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: `CROSSWORD#${date}`, SK: "PUZZLE" } }),
  );
  return (res.Item?.puzzle as Puzzle) ?? null;
}

async function storePuzzle(date: string, puzzle: Puzzle): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: `CROSSWORD#${date}`, SK: "PUZZLE", date, puzzle },
    }),
  );
}

/** Get (or generate+store) the canonical puzzle for a date. */
async function todaysPuzzle(): Promise<{ date: string; puzzle: Puzzle }> {
  const date = dateKey();
  const existing = await getStored(date);
  if (existing) return { date, puzzle: existing };
  // Seed by the UTC day number so on-demand and cron produce the same puzzle.
  const puzzle = generatePuzzle(dayNumberUTC());
  await storePuzzle(date, puzzle);
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
      // Practice: a fresh random puzzle, not stored.
      const puzzle = generatePuzzle(Math.floor(Math.random() * 2 ** 31));
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
