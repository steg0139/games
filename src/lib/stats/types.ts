// Shared shapes for player profile: settings + per-game stats.
// This is the single object persisted locally and backed up to DynamoDB.

export interface SolitaireStats {
  gamesPlayed: number;
  gamesWon: number;
  bestMoves: number | null; // fewest moves in a win
  bestTimeSeconds: number | null; // fastest win
  currentStreak: number;
  bestStreak: number;
}

export interface BlackjackStats {
  handsPlayed: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  bestBankroll: number;
}

export interface VideoPokerStats {
  handsPlayed: number;
  handsPaid: number; // hands that returned a payout
  bestBankroll: number;
  bestPayout: number; // largest single-hand payout
}

export interface CrosswordStats {
  completed: number; // puzzles fully solved
  currentStreak: number; // consecutive days completed
  bestStreak: number;
  lastCompletedDay: number | null; // dayNumber of last completion (for streak)
}

/** Solitaire draw mode: flip 1 or 3 cards from the stock per draw. */
export type DrawCount = 1 | 3;

export interface Settings {
  soundEnabled: boolean;
  solitaireDrawCount: DrawCount;
  /** Automatically complete the game once a win is guaranteed. */
  solitaireAutoFinish: boolean;
}

export interface Profile {
  version: number;
  settings: Settings;
  solitaire: SolitaireStats;
  blackjack: BlackjackStats;
  videopoker: VideoPokerStats;
  crossword: CrosswordStats;
  updatedAt: number; // epoch ms of last local mutation
}

export const PROFILE_VERSION = 1;

export function emptySolitaireStats(): SolitaireStats {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    bestMoves: null,
    bestTimeSeconds: null,
    currentStreak: 0,
    bestStreak: 0,
  };
}

export function emptyBlackjackStats(): BlackjackStats {
  return {
    handsPlayed: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    blackjacks: 0,
    bestBankroll: 0,
  };
}

export function emptyVideoPokerStats(): VideoPokerStats {
  return {
    handsPlayed: 0,
    handsPaid: 0,
    bestBankroll: 0,
    bestPayout: 0,
  };
}

export function emptyCrosswordStats(): CrosswordStats {
  return {
    completed: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastCompletedDay: null,
  };
}

export function defaultProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    settings: {
      soundEnabled: true,
      solitaireDrawCount: 3,
      solitaireAutoFinish: true,
    },
    solitaire: emptySolitaireStats(),
    blackjack: emptyBlackjackStats(),
    videopoker: emptyVideoPokerStats(),
    crossword: emptyCrosswordStats(),
    updatedAt: 0,
  };
}

/** Merge two profiles, preferring the more recently updated one field-group-wise.
 *  Used when reconciling a cloud copy with the local copy. */
export function mergeProfiles(a: Profile, b: Profile): Profile {
  // Whichever has the later updatedAt wins wholesale; ties keep `a`.
  return b.updatedAt > a.updatedAt ? b : a;
}
