// Fetches the daily/practice Word Search from the backend and caches the daily
// puzzle (by date) so it's offline-friendly and prefetchable on app open.
import { fetchJson, readCache, todayKey, writeCache } from "../../lib/daily";
import type { WordSearchPuzzle } from "./logic";

const CACHE_PREFIX = "cards.wordsearch.";

export interface DailyWordSearch {
  date: string;
  puzzle: WordSearchPuzzle;
}

interface WordSearchResponse {
  date: string | null;
  puzzle: WordSearchPuzzle;
}

/** Today's puzzle: cache first, else fetch and cache. Null if no cache AND the
 *  network failed. */
export async function getTodaysWordSearch(): Promise<DailyWordSearch | null> {
  const date = todayKey();
  const cached = readCache<WordSearchPuzzle>(CACHE_PREFIX, date);
  if (cached) return { date, puzzle: cached };

  const res = await fetchJson<WordSearchResponse>("/wordsearch/today");
  if (!res) return null;
  const puzzleDate = res.date ?? date;
  writeCache(CACHE_PREFIX, puzzleDate, res.puzzle);
  return { date: puzzleDate, puzzle: res.puzzle };
}

/** Fire-and-forget prefetch of today's puzzle on app open. */
export function prefetchTodaysWordSearch(): void {
  const date = todayKey();
  if (readCache(CACHE_PREFIX, date)) return;
  void getTodaysWordSearch();
}

/** A random practice puzzle (not cached). Null if unavailable/offline. */
export async function getRandomWordSearch(): Promise<WordSearchPuzzle | null> {
  const res = await fetchJson<WordSearchResponse>("/wordsearch/random");
  return res?.puzzle ?? null;
}
