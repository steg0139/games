import { useEffect, useSyncExternalStore } from "react";
import { profileStore } from "./store";
import type { Profile, Settings } from "./types";

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
