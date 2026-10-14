// Daily competition client. Publishes this device's result for today's
// crossword/sudoku/word search and reads friends' results for the same board.
// All calls fail soft (null / false) so the games keep working offline.
import { API_BASE_URL, CLOUD_SYNC_ENABLED } from "../config";
import { getDeviceId } from "../device";

const TIMEOUT_MS = 8000;

function withTimeout(): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  controller.signal.addEventListener("abort", () => clearTimeout(timer), {
    once: true,
  });
  return controller.signal;
}

/** Which daily board. Crossword has a single board ("-"); sudoku/word search
 *  split by difficulty so times are compared fairly within a difficulty. */
export type DailyGame = "crossword" | "sudoku" | "wordsearch";
export type DailyVariant = "-" | "easy" | "regular" | "medium" | "hard";

/** One person's result on a given daily board. */
export interface DailyResult {
  code: string;
  displayName: string;
  timeSeconds: number;
  hints: number;
  completedAt: number;
}

export interface DailyBoardKey {
  game: DailyGame;
  day: number;
  variant: DailyVariant;
}

/**
 * Publish this device's result for a daily board. First write wins on the
 * backend (a replay or second device can't change your time). Returns true if
 * the server accepted it (including when it was already recorded).
 */
export async function postDailyResult(
  key: DailyBoardKey,
  entry: {
    code: string;
    displayName: string;
    timeSeconds: number;
    hints: number;
  },
): Promise<boolean> {
  if (!CLOUD_SYNC_ENABLED) return false;
  if (!entry.code) return false;
  const deviceId = getDeviceId();

  try {
    const res = await fetch(`${API_BASE_URL}/daily`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-device-id": deviceId,
      },
      body: JSON.stringify({ ...key, ...entry }),
      signal: withTimeout(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch the daily results for a set of friend codes on one board. Pass the
 * codes you already hold (yourself + friends); the server only returns those.
 * Returns an array (possibly empty), or null if unavailable.
 */
export async function fetchDailyResults(
  key: DailyBoardKey,
  codes: string[],
): Promise<DailyResult[] | null> {
  if (!CLOUD_SYNC_ENABLED) return null;
  const unique = Array.from(new Set(codes.filter(Boolean)));
  if (unique.length === 0) return [];

  try {
    const res = await fetch(`${API_BASE_URL}/daily/results`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...key, codes: unique }),
      signal: withTimeout(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: DailyResult[] } | null;
    if (!data || !Array.isArray(data.results)) return null;
    return data.results;
  } catch {
    return null;
  }
}

/**
 * Rank results for display: fastest time first; ties broken by fewer hints,
 * then earlier completion. Pure — safe to unit test. Entries missing a numeric
 * time sort last.
 */
export function rankDailyResults(results: DailyResult[]): DailyResult[] {
  return [...results].sort((a, b) => {
    const at = Number.isFinite(a.timeSeconds) ? a.timeSeconds : Infinity;
    const bt = Number.isFinite(b.timeSeconds) ? b.timeSeconds : Infinity;
    if (at !== bt) return at - bt;
    if (a.hints !== b.hints) return a.hints - b.hints;
    return (a.completedAt || 0) - (b.completedAt || 0);
  });
}
