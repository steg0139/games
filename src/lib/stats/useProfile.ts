import { useEffect, useSyncExternalStore } from "react";
import { profileStore } from "./store";
import {
  type Profile,
  type Settings,
  emptyBlackjackStats,
  emptyCrosswordStats,
  emptySolitaireStats,
  emptyVideoPokerStats,
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

/** Reset all stats and settings to defaults (local + cloud). */
export function clearProfile(): Promise<void> {
  return profileStore.clear();
}

export type GameKey = "solitaire" | "blackjack" | "videopoker" | "crossword";

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

export function recordBlackjackHand(result: BlackjackResult, bankroll: number): void {
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
    return { ...p, blackjack: b };
  });
}

export function recordVideoPokerHand(result: {
  paid: boolean;
  payout: number;
  bankroll: number;
}): void {
  profileStore.update((p) => {
    const v = { ...p.videopoker };
    v.handsPlayed += 1;
    if (result.paid) v.handsPaid += 1;
    v.bestPayout = Math.max(v.bestPayout, result.payout);
    v.bestBankroll = Math.max(v.bestBankroll, result.bankroll);
    return { ...p, videopoker: v };
  });
}

/** Record completing today's crossword. `day` is the dayNumber; streak counts
 *  consecutive days. Idempotent: completing the same day again is a no-op. */
export function recordCrosswordComplete(day: number): void {
  profileStore.update((p) => {
    const c = { ...p.crossword };
    if (c.lastCompletedDay === day) return p; // already recorded today
    c.completed += 1;
    c.currentStreak =
      c.lastCompletedDay !== null && day === c.lastCompletedDay + 1
        ? c.currentStreak + 1
        : 1;
    c.bestStreak = Math.max(c.bestStreak, c.currentStreak);
    c.lastCompletedDay = day;
    return { ...p, crossword: c };
  });
}
