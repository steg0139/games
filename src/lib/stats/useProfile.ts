import { useEffect, useSyncExternalStore } from "react";
import { profileStore } from "./store";
import {
  type DailyStats,
  type Profile,
  type Settings,
  emptyBlackjackStats,
  emptyCrosswordStats,
  emptySolitaireStats,
  emptySudokuStats,
  emptyVideoPokerStats,
  emptyWordSearchStats,
} from "./types";

/** Subscribe a component to the live profile. */
export function useProfile(): Profile {
  const profile = useSyncExternalStore(
    (cb) => profileStore.subscribe(cb),
    () => profileStore.getProfile(),
  );

  // Kick off cloud reconcile once on first mount.
  useEffect(() => {
    void profileStore.init();
  }, []);

  return profile;
}

export function updateSettings(patch: Partial<Settings>): void {
  profileStore.update((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
}

// ---- Social / friends ----------------------------------------------------

/** Assign a friend code if none yet, returning it. */
export function ensureFriendCode(): string {
  return profileStore.ensureFriendCode();
}

/** Set the public display name (also assigns a friend code). */
export function setDisplayName(name: string): void {
  profileStore.setDisplayName(name);
}

/** Add a friend by public code. Returns the normalized code, or null if the
 *  code is invalid or is the user's own. */
export function addFriend(code: string, displayName?: string): string | null {
  return profileStore.addFriend(code, displayName);
}

/** Update a cached friend display name (called after fetching their public profile). */
export function updateFriendName(code: string, displayName: string): void {
  profileStore.updateFriendName(code, displayName);
}

/** Remove a friend by code. */
export function removeFriend(code: string): void {
  profileStore.removeFriend(code);
}

/** Reset all stats and settings to defaults (local + cloud). */
export function clearProfile(): Promise<void> {
  return profileStore.clear();
}

export type GameKey =
  | "solitaire"
  | "blackjack"
  | "videopoker"
  | "crossword"
  | "sudoku"
  | "wordsearch";

/**
 * Reset stats for a single game, keeping the other games' stats and all
 * settings. Persists locally and syncs the change to the cloud (no full
 * delete needed since the rest of the profile stays).
 */
export function resetGameStats(game: GameKey): void {
  profileStore.update((p) => {
    if (game === "solitaire") return { ...p, solitaire: emptySolitaireStats() };
    if (game === "blackjack") return { ...p, blackjack: emptyBlackjackStats() };
    if (game === "videopoker") return { ...p, videopoker: emptyVideoPokerStats() };
    if (game === "sudoku") return { ...p, sudoku: emptySudokuStats() };
    if (game === "wordsearch") return { ...p, wordsearch: emptyWordSearchStats() };
    return { ...p, crossword: emptyCrosswordStats() };
  });
}

// ---- Game stat recorders -------------------------------------------------

export function recordSolitaireResult(result: {
  won: boolean;
  moves: number;
  timeSeconds: number;
}): void {
  profileStore.update((p) => {
    const s = { ...p.solitaire };
    s.gamesPlayed += 1;
    if (result.won) {
      s.gamesWon += 1;
      s.currentStreak += 1;
      s.bestStreak = Math.max(s.bestStreak, s.currentStreak);
      s.bestMoves =
        s.bestMoves === null ? result.moves : Math.min(s.bestMoves, result.moves);
      s.bestTimeSeconds =
        s.bestTimeSeconds === null
          ? result.timeSeconds
          : Math.min(s.bestTimeSeconds, result.timeSeconds);
    } else {
      s.currentStreak = 0;
    }
    return { ...p, solitaire: s };
  });
}

export type BlackjackResult = "win" | "loss" | "push" | "blackjack";

export function recordBlackjackHand(
  result: BlackjackResult,
  bankroll: number,
  opts?: { bet?: number; netWin?: number },
): void {
  profileStore.update((p) => {
    const b = { ...p.blackjack };
    b.handsPlayed += 1;
    if (result === "win") b.wins += 1;
    else if (result === "loss") b.losses += 1;
    else if (result === "push") b.pushes += 1;
    else if (result === "blackjack") {
      b.wins += 1;
      b.blackjacks += 1;
    }
    b.bestBankroll = Math.max(b.bestBankroll, bankroll);
    if (opts?.bet != null) b.biggestBet = Math.max(b.biggestBet, opts.bet);
    if (opts?.netWin != null) b.biggestWin = Math.max(b.biggestWin, opts.netWin);
    return { ...p, blackjack: b };
  });
}

export function recordVideoPokerHand(result: {
  paid: boolean;
  payout: number;
  bankroll: number;
  bet?: number;
}): void {
  profileStore.update((p) => {
    const v = { ...p.videopoker };
    v.handsPlayed += 1;
    if (result.paid) v.handsPaid += 1;
    v.bestPayout = Math.max(v.bestPayout, result.payout);
    v.bestBankroll = Math.max(v.bestBankroll, result.bankroll);
    if (result.bet != null) v.biggestBet = Math.max(v.biggestBet, result.bet);
    return { ...p, videopoker: v };
  });
}

// ---- Hint counters -------------------------------------------------------

/** Record that the player used a hint in a game that supports hints. */
export function recordHintUsed(game: "solitaire" | "sudoku"): void {
  profileStore.update((p) => {
    if (game === "solitaire") {
      return { ...p, solitaire: { ...p.solitaire, hintsUsed: p.solitaire.hintsUsed + 1 } };
    }
    return { ...p, sudoku: { ...p.sudoku, hintsUsed: p.sudoku.hintsUsed + 1 } };
  });
}

/** Fold a new completion time into a running best (fastest). Null-safe. */
function betterTime(current: number | null, next: number | null): number | null {
  if (next == null || next <= 0) return current;
  return current == null ? next : Math.min(current, next);
}

/** Record completing today's crossword. `day` is the dayNumber; streak counts
 *  consecutive days. `timeSeconds` (optional) updates the best time even on a
 *  repeat day. The completion/streak bump is idempotent per day. */
export function recordCrosswordComplete(day: number, timeSeconds?: number): void {
  profileStore.update((p) => {
    const c = { ...p.crossword };
    const newBest = betterTime(c.bestTimeSeconds, timeSeconds ?? null);
    if (c.lastCompletedDay === day) {
      // Already counted today — still let a faster time through.
      if (newBest === c.bestTimeSeconds) return p;
      return { ...p, crossword: { ...c, bestTimeSeconds: newBest } };
    }
    c.completed += 1;
    c.currentStreak =
      c.lastCompletedDay !== null && day === c.lastCompletedDay + 1
        ? c.currentStreak + 1
        : 1;
    c.bestStreak = Math.max(c.bestStreak, c.currentStreak);
    c.lastCompletedDay = day;
    c.bestTimeSeconds = newBest;
    return { ...p, crossword: c };
  });
}

/** Advance a daily-completion stat block for `day` (dayNumber). The streak/
 *  completion bump is idempotent per day; a faster `timeSeconds` always lands.
 *  Shared by Sudoku + Word Search. */
function advanceDaily<T extends DailyStats>(
  stats: T,
  day: number,
  timeSeconds?: number,
): T {
  const newBest = betterTime(stats.bestTimeSeconds, timeSeconds ?? null);
  if (stats.lastCompletedDay === day) {
    // Already counted today — still let a faster time through.
    return newBest === stats.bestTimeSeconds
      ? stats
      : { ...stats, bestTimeSeconds: newBest };
  }
  const currentStreak =
    stats.lastCompletedDay !== null && day === stats.lastCompletedDay + 1
      ? stats.currentStreak + 1
      : 1;
  return {
    ...stats,
    completed: stats.completed + 1,
    currentStreak,
    bestStreak: Math.max(stats.bestStreak, currentStreak),
    lastCompletedDay: day,
    bestTimeSeconds: newBest,
  };
}

/** Record completing today's Sudoku (either difficulty counts for the one
 *  shared streak). `day` is the dayNumber. Idempotent per day. */
export function recordSudokuComplete(day: number, timeSeconds?: number): void {
  profileStore.update((p) => {
    const next = advanceDaily(p.sudoku, day, timeSeconds);
    return next === p.sudoku ? p : { ...p, sudoku: next };
  });
}

/** Record completing today's Word Search. `day` is the dayNumber. Idempotent. */
export function recordWordSearchComplete(day: number, timeSeconds?: number): void {
  profileStore.update((p) => {
    const next = advanceDaily(p.wordsearch, day, timeSeconds);
    return next === p.wordsearch ? p : { ...p, wordsearch: next };
  });
}
