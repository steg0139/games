// Persist an in-progress Solitaire game to localStorage so leaving the screen
// (or closing the PWA) and returning resumes the same board. This is transient
// game state, not a stat, so it stays local (no cloud sync).
import type { DrawCount } from "../../lib/stats/types";
import type { SolitaireState } from "./logic";

const STORAGE_KEY = "cards.solitaire.game";
// v4: dead-end detection now simulates stock cycling, so drawsSinceProgress was
// removed. Older saves (v3 and earlier) are ignored and the game resets.
const SAVE_VERSION = 4;

export interface HistoryEntry {
  state: SolitaireState;
  moves: number;
}

export interface SavedGame {
  version: number;
  state: SolitaireState;
  moves: number;
  startedAt: number; // epoch ms of the original deal
  drawCount: DrawCount;
  history: HistoryEntry[];
}

export function loadGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGame;
    if (
      !parsed ||
      parsed.version !== SAVE_VERSION ||
      !parsed.state ||
      !Array.isArray(parsed.state.tableau) ||
      parsed.state.tableau.length !== 7 ||
      !Array.isArray(parsed.state.foundations) ||
      parsed.state.foundations.length !== 4
    ) {
      return null;
    }
    return {
      ...parsed,
      history: parsed.history ?? [],
    };
  } catch {
    return null;
  }
}

export function saveGame(save: Omit<SavedGame, "version">): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SAVE_VERSION, ...save }),
    );
  } catch {
    // Storage full or unavailable — resume just won't be available.
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else to do.
  }
}
