// Shared helpers for the backend-generated daily puzzles (Crossword already has
// its own copy; Sudoku and Word Search use these). A daily is one canonical
// puzzle per Central calendar day, fetched from the backend and cached in
// localStorage so it's offline-friendly and prefetchable on app open.
import { API_BASE_URL, CLOUD_SYNC_ENABLED } from "./config";

const TIMEOUT_MS = 8000;

// The daily rolls over at midnight America/Chicago (Central) for everyone — the
// same rule the backend uses, so the date keys match. The IANA zone tracks
// CST/CDT automatically.
const DAILY_TIME_ZONE = "America/Chicago";

/** Today's canonical daily key (YYYY-MM-DD) in Central time. */
export function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** The UTC day-number for a Central date string — the integer streaks use. */
export function dayNumberForKey(key: string): number {
  return Math.floor(Date.parse(`${key}T00:00:00Z`) / 86_400_000);
}

/** GET `${API_BASE_URL}${pathname}` as JSON, fail-soft (null) with a timeout. */
export async function fetchJson<T>(pathname: string): Promise<T | null> {
  if (!CLOUD_SYNC_ENABLED) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}${pathname}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A tiny localStorage cache keyed by `${prefix}${key}`. Fail-soft. */
export function readCache<T>(prefix: string, key: string): T | null {
  try {
    const raw = localStorage.getItem(prefix + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(prefix: string, key: string, value: T): void {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value));
  } catch {
    /* storage full/unavailable — non-fatal */
  }
}
