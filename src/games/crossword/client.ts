// Fetches the daily/practice crossword from the backend and caches the daily
// puzzle locally (by date) so it's available offline once loaded and can be
// prefetched on app open.
import { API_BASE_URL, CLOUD_SYNC_ENABLED } from "../../lib/config";
import type { CrosswordData } from "./logic";

const CACHE_PREFIX = "cards.crossword.";
const TIMEOUT_MS = 8000;

export interface DailyPuzzle {
  date: string; // YYYY-MM-DD (UTC)
  data: CrosswordData;
}

/** Local date key (UTC) matching the backend's canonical daily key. */
export function todayKey(): string {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

function readCache(date: string): CrosswordData | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + date);
    return raw ? (JSON.parse(raw) as CrosswordData) : null;
  } catch {
    return null;
  }
}

function writeCache(date: string, data: CrosswordData): void {
  try {
    localStorage.setItem(CACHE_PREFIX + date, JSON.stringify(data));
  } catch {
    /* storage full/unavailable — non-fatal */
  }
}

async function fetchJson(pathname: string): Promise<{
  date: string | null;
  puzzle: CrosswordData;
} | null> {
  if (!CLOUD_SYNC_ENABLED) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}${pathname}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as { date: string | null; puzzle: CrosswordData };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get today's puzzle: cache first (offline-friendly), else fetch and cache.
 * Returns null only if there's no cache AND the network fetch failed.
 */
export async function getTodaysPuzzle(): Promise<DailyPuzzle | null> {
  const date = todayKey();
  const cached = readCache(date);
  if (cached) return { date, data: cached };

  const res = await fetchJson("/crossword/today");
  if (!res) return null;
  const puzzleDate = res.date ?? date;
  writeCache(puzzleDate, res.puzzle);
  return { date: puzzleDate, data: res.puzzle };
}

/** Fire-and-forget prefetch of today's puzzle (called on app open). */
export function prefetchTodaysPuzzle(): void {
  const date = todayKey();
  if (readCache(date)) return; // already have it
  void getTodaysPuzzle();
}

/** A random practice puzzle (not cached). Null if unavailable/offline. */
export async function getRandomPuzzle(): Promise<CrosswordData | null> {
  const res = await fetchJson("/crossword/random");
  return res?.puzzle ?? null;
}
