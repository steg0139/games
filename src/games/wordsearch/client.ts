// Fetches the daily/practice Word Search from the backend and caches the daily
// puzzle per (date, difficulty) so it's offline-friendly and prefetchable.
import { fetchJson, readCache, todayKey, writeCache } from "../../lib/daily";
import type { WordSearchDifficulty } from "../../lib/stats/types";
import type { WordSearchPuzzle } from "./logic";

const CACHE_PREFIX = "cards.wordsearch.";

const DIFFICULTIES: WordSearchDifficulty[] = ["easy", "medium", "hard"];

export interface DailyWordSearch {
  date: string;
  difficulty: WordSearchDifficulty;
  puzzle: WordSearchPuzzle;
}

interface WordSearchResponse {
  date: string | null;
  difficulty: WordSearchDifficulty;
  puzzle: WordSearchPuzzle;
}

/** Cache key includes difficulty so each grid size is stored separately. */
function cacheKey(date: string, difficulty: WordSearchDifficulty): string {
  return `${date}.${difficulty}`;
}

/** Today's puzzle for `difficulty`: cache first, else fetch and cache. Null if
 *  no cache AND the network failed. */
export async function getTodaysWordSearch(
  difficulty: WordSearchDifficulty,
): Promise<DailyWordSearch | null> {
  const date = todayKey();
  const cached = readCache<WordSearchPuzzle>(
    CACHE_PREFIX,
    cacheKey(date, difficulty),
  );
  if (cached) return { date, difficulty, puzzle: cached };

  const res = await fetchJson<WordSearchResponse>(
    `/wordsearch/today?difficulty=${difficulty}`,
  );
  if (!res) return null;
  const puzzleDate = res.date ?? date;
  writeCache(CACHE_PREFIX, cacheKey(puzzleDate, difficulty), res.puzzle);
  return { date: puzzleDate, difficulty, puzzle: res.puzzle };
}

/** Fire-and-forget prefetch of today's puzzle (all difficulties) on app open. */
export function prefetchTodaysWordSearch(): void {
  const date = todayKey();
  for (const difficulty of DIFFICULTIES) {
    if (!readCache(CACHE_PREFIX, cacheKey(date, difficulty))) {
      void getTodaysWordSearch(difficulty);
    }
  }
}

/** A random practice puzzle (not cached). Null if unavailable/offline. */
export async function getRandomWordSearch(
  difficulty: WordSearchDifficulty,
): Promise<WordSearchPuzzle | null> {
  const res = await fetchJson<WordSearchResponse>(
    `/wordsearch/random?difficulty=${difficulty}`,
  );
  return res?.puzzle ?? null;
}
