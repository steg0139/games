// Persist the player's Blackjack chip balance across sessions. Separate from
// the stats profile's `bestBankroll` (a high-water mark) — this is the live
// wallet. Resets to the starting stack only on explicit reset or when broke.
import { STARTING_BANKROLL } from "./logic";

const KEY = "cards.blackjack.bankroll";

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
