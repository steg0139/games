// Fetches the daily/practice Sudoku from the backend and caches the daily
// puzzle per (date, difficulty) so it's offline-friendly and prefetchable.
import { fetchJson, readCache, todayKey, writeCache } from "../../lib/daily";
import type { SudokuDifficulty, SudokuPuzzle } from "./logic";

const CACHE_PREFIX = "cards.sudoku.";

export interface DailySudoku {
  date: string;
  difficulty: SudokuDifficulty;
  puzzle: SudokuPuzzle;
}

interface SudokuResponse {
  date: string | null;
  difficulty: SudokuDifficulty;
  puzzle: SudokuPuzzle;
}

/** Cache key includes difficulty so easy/regular are stored separately. */
function cacheKey(date: string, difficulty: SudokuDifficulty): string {
  return `${date}.${difficulty}`;
}

/**
 * Today's Sudoku for `difficulty`: cache first, else fetch and cache.
 * Null only if there's no cache AND the network fetch failed.
 */
export async function getTodaysSudoku(
  difficulty: SudokuDifficulty,
): Promise<DailySudoku | null> {
  const date = todayKey();
  const cached = readCache<SudokuPuzzle>(CACHE_PREFIX, cacheKey(date, difficulty));
  if (cached) return { date, difficulty, puzzle: cached };

  const res = await fetchJson<SudokuResponse>(
    `/sudoku/today?difficulty=${difficulty}`,
  );
  if (!res) return null;
  const puzzleDate = res.date ?? date;
  writeCache(CACHE_PREFIX, cacheKey(puzzleDate, difficulty), res.puzzle);
  return { date: puzzleDate, difficulty, puzzle: res.puzzle };
}

/** Fire-and-forget prefetch of today's Sudoku (both difficulties) on app open. */
export function prefetchTodaysSudoku(): void {
  const date = todayKey();
  for (const difficulty of ["easy", "regular"] as SudokuDifficulty[]) {
    if (!readCache(CACHE_PREFIX, cacheKey(date, difficulty))) {
      void getTodaysSudoku(difficulty);
    }
  }
}

/** A random practice puzzle (not cached). Null if unavailable/offline. */
export async function getRandomSudoku(
  difficulty: SudokuDifficulty,
): Promise<SudokuPuzzle | null> {
  const res = await fetchJson<SudokuResponse>(
    `/sudoku/random?difficulty=${difficulty}`,
  );
  return res?.puzzle ?? null;
}
