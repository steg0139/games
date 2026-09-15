// Persist the Video Poker chip balance across sessions (own wallet, separate
// from Blackjack). Resets to the starting stack on explicit reset or when broke.
import { STARTING_BANKROLL } from "./logic";

const KEY = "cards.videopoker.bankroll";

export function loadBankroll(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return STARTING_BANKROLL;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return STARTING_BANKROLL;
    return Math.floor(n);
  } catch {
    return STARTING_BANKROLL;
  }
}

export function saveBankroll(amount: number): void {
  try {
    localStorage.setItem(KEY, String(Math.max(0, Math.floor(amount))));
  } catch {
    // Storage unavailable — balance just won't persist.
  }
}

export function clearBankroll(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing else to do.
  }
}
