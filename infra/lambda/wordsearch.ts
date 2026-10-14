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
import longWords from "./wordsearch-long-words.json";
import { isBlockedWord } from "./word-blocklist";

const TABLE_NAME = process.env.TABLE_NAME!;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type Difficulty = "easy" | "medium" | "hard";

// Grid size + word count per difficulty. Bigger grid = harder. maxWordLen is
// capped to the grid size so words always fit. `longWordMax` is how many
// longer (8+ letter) words a puzzle may include; the actual count varies per
// day (0..longWordMax) so long words show up occasionally, not every time.
interface DiffConfig {
  size: number;
  wordCount: number;
  minWordLen: number;
  maxWordLen: number;
  longWordMax: number;
}
const DIFFICULTY: Record<Difficulty, DiffConfig> = {
  easy: { size: 8, wordCount: 6, minWordLen: 3, maxWordLen: 7, longWordMax: 0 },
  medium: { size: 12, wordCount: 10, minWordLen: 4, maxWordLen: 11, longWordMax: 2 },
  hard: { size: 15, wordCount: 14, minWordLen: 4, maxWordLen: 14, longWordMax: 3 },
};

// Threshold at which a word counts as "long" for the per-difficulty quota.
const LONG_WORD_MIN = 8;

const NO_REPEAT_DAYS = 30;

// Short candidate words from the shared crossword pool (3-8 letters).
const SHORT_WORDS: string[] = Array.from(
  new Set(
    (wordPool as { answer: string }[])
      .map((w) => w.answer.toUpperCase())
      .filter((w) => /^[A-Z]+$/.test(w) && w.length >= 3 && w.length <= 8)
      // Runtime safety net on top of the build-time filter.
      .filter((w) => !isBlockedWord(w)),
  ),
);

// Longer words (8-12 letters), word-search only, so medium/hard can include a
// few long entries the clue-gated crossword pool doesn't carry.
const LONG_WORDS: string[] = Array.from(
  new Set(
    (longWords as string[])
      .map((w) => w.toUpperCase())
      .filter((w) => /^[A-Z]+$/.test(w) && w.length >= LONG_WORD_MIN && w.length <= 14)
      .filter((w) => !isBlockedWord(w)),
  ),
);

// Full candidate set for a difficulty's length window.
const ALL_WORDS: string[] = Array.from(new Set([...SHORT_WORDS, ...LONG_WORDS]));

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

interface Candidate {
  row: number;
  col: number;
  dr: number;
  dc: number;
  overlap: number; // how many letters land on existing matching letters
}

/**
 * Try to place `word` into an `n`x`n` `grid` ("" = empty), PREFERRING placements
 * that overlap (cross) already-placed words so the puzzle interlocks more.
 *
 * We enumerate a seeded-random sample of legal positions/directions, score each
 * by how many of its cells reuse an existing matching letter, and then bias the
 * pick toward higher overlap: once any crossing placement exists we choose only
 * among the max-overlap candidates (ties broken randomly). If nothing overlaps
 * (e.g. the first word, or a word that can't cross), we fall back to a random
 * legal spot. Deterministic for a given seed.
 */
function placeWord(
  grid: string[],
  n: number,
  word: string,
  rand: () => number,
): Placement | null {
  const candidates: Candidate[] = [];
  for (let attempt = 0; attempt < 160; attempt++) {
    const [dr, dc] = DIRECTIONS[Math.floor(rand() * DIRECTIONS.length)];
    const row = Math.floor(rand() * n);
    const col = Math.floor(rand() * n);
    const endR = row + dr * (word.length - 1);
    const endC = col + dc * (word.length - 1);
    if (endR < 0 || endR >= n || endC < 0 || endC >= n) continue;

    let ok = true;
    let overlap = 0;
    for (let i = 0; i < word.length; i++) {
      const existing = grid[(row + dr * i) * n + (col + dc * i)];
      if (existing === "") continue;
      if (existing === word[i]) overlap++;
      else {
        ok = false;
        break;
      }
    }
    if (ok) candidates.push({ row, col, dr, dc, overlap });
  }
  if (candidates.length === 0) return null;

  // Prefer the most-overlapping placements. When some placement crosses an
  // existing word, choose only among the best (max-overlap) ones; otherwise any
  // legal spot is fine. Ties are broken by the seeded RNG for variety.
  const maxOverlap = candidates.reduce((m, c) => Math.max(m, c.overlap), 0);
  const best =
    maxOverlap > 0 ? candidates.filter((c) => c.overlap === maxOverlap) : candidates;
  const chosen = best[Math.floor(rand() * best.length)];

  for (let i = 0; i < word.length; i++) {
    grid[(chosen.row + chosen.dr * i) * n + (chosen.col + chosen.dc * i)] =
      word[i];
  }
  return { word, row: chosen.row, col: chosen.col, dr: chosen.dr, dc: chosen.dc };
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
  // Words must also physically fit the grid regardless of the config cap.
  const fitMax = Math.min(cfg.maxWordLen, n);

  const lengthOk = (w: string) =>
    w.length >= cfg.minWordLen && w.length <= fitMax;
  const notRecent = (w: string) => !exclude.has(w);

  // Reserve a VARIED number of long (8+ letter) words so they appear
  // occasionally rather than every day: a seeded 0..longWordMax for this
  // puzzle. Long words are placed first — longest-first — which both
  // guarantees they fit and seeds crossing points for the shorter words.
  const longTarget =
    cfg.longWordMax > 0 ? Math.floor(rand() * (cfg.longWordMax + 1)) : 0;

  const longPool = shuffle(
    LONG_WORDS.filter((w) => lengthOk(w) && w.length >= LONG_WORD_MIN && notRecent(w)),
    rand,
  ).sort((a, b) => b.length - a.length);

  // Fill pool is genuinely short (< LONG_WORD_MIN) so long words only ever
  // enter through the reserved quota above — keeping them occasional.
  const shortPool = ALL_WORDS.filter(
    (w) => lengthOk(w) && w.length < LONG_WORD_MIN,
  );
  const shortCandidates = shuffle(shortPool.filter(notRecent), rand);
  // Fall back to the full pool (ignoring the recent-exclude) if we're short on
  // fresh candidates, so generation never starves.
  const shortUsable =
    shortCandidates.length >= cfg.wordCount * 3
      ? shortCandidates
      : shuffle(shortPool, rand);

  const grid = new Array<string>(n * n).fill("");
  const placements: Placement[] = [];
  const words: string[] = [];

  const tryPlace = (word: string): boolean => {
    if (words.length >= cfg.wordCount) return false;
    if (words.includes(word)) return false;
    const placement = placeWord(grid, n, word, rand);
    if (placement) {
      placements.push(placement);
      words.push(word);
      return true;
    }
    return false;
  };

  // 1) Place up to `longTarget` long words first.
  let longPlaced = 0;
  for (const word of longPool) {
    if (longPlaced >= longTarget || words.length >= cfg.wordCount) break;
    if (tryPlace(word)) longPlaced++;
  }

  // 2) Fill the remaining slots with shorter words.
  for (const word of shortUsable) {
    if (words.length >= cfg.wordCount) break;
    tryPlace(word);
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
