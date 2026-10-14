// Shared shapes for player profile: settings + per-game stats.
// This is the single object persisted locally and backed up to DynamoDB.

export interface SolitaireStats {
  gamesPlayed: number;
  gamesWon: number;
  bestMoves: number | null; // fewest moves in a win
  bestTimeSeconds: number | null; // fastest win
  currentStreak: number;
  bestStreak: number;
  hintsUsed: number; // total hints requested (lifetime)
}

export interface BlackjackStats {
  handsPlayed: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  bestBankroll: number;
  biggestBet: number; // largest single wager placed
  biggestWin: number; // largest single-hand net win
}

export interface VideoPokerStats {
  handsPlayed: number;
  handsPaid: number; // hands that returned a payout
  bestBankroll: number;
  bestPayout: number; // largest single-hand payout
  biggestBet: number; // largest single wager placed
}

export interface CrosswordStats {
  completed: number; // puzzles fully solved
  currentStreak: number; // consecutive days completed
  bestStreak: number;
  lastCompletedDay: number | null; // dayNumber of last completion (for streak)
  bestTimeSeconds: number | null; // fastest completion
}

/** Daily-completion stats (one shared streak). Used by Sudoku and Word Search.
 *  For Sudoku, completing EITHER difficulty counts for the single streak. */
export interface DailyStats {
  completed: number;
  currentStreak: number;
  bestStreak: number;
  lastCompletedDay: number | null;
  bestTimeSeconds: number | null; // fastest completion
  hintsUsed: number; // total hints requested (lifetime; Word Search has no hints → stays 0)
}

export type SudokuStats = DailyStats;
export type WordSearchStats = DailyStats;

/** Solitaire draw mode: flip 1 or 3 cards from the stock per draw. */
export type DrawCount = 1 | 3;

/** Sudoku difficulty the player picks for the daily (one streak either way). */
export type SudokuDifficulty = "easy" | "regular";

/** Word Search difficulty — bigger grid = harder (one streak regardless). */
export type WordSearchDifficulty = "easy" | "medium" | "hard";

export interface Settings {
  soundEnabled: boolean;
  solitaireDrawCount: DrawCount;
  /** Automatically complete the game once a win is guaranteed. */
  solitaireAutoFinish: boolean;
  /** Preferred difficulty for the daily Sudoku. */
  sudokuDifficulty: SudokuDifficulty;
  /** Highlight all cells sharing the selected cell's number. */
  sudokuHighlightSame: boolean;
  /** Preferred difficulty (grid size) for the daily Word Search. */
  wordsearchDifficulty: WordSearchDifficulty;
}

/** A friend this device has added, remembered by their public friend code.
 *  `displayName` is a cached label for the UI; the authoritative name comes
 *  from the friend's public profile when fetched. */
export interface Friend {
  code: string; // the friend's public friend code
  displayName: string; // last-known display name (cached for offline display)
  addedAt: number; // epoch ms when added
}

export interface Profile {
  version: number;
  /** Public display name shown to friends. Empty until the user sets one. */
  displayName: string;
  /** Public, shareable code others use to add this profile. Distinct from the
   *  private device id (which is a write secret). Assigned lazily on first use. */
  friendCode: string;
  settings: Settings;
  solitaire: SolitaireStats;
  blackjack: BlackjackStats;
  videopoker: VideoPokerStats;
  crossword: CrosswordStats;
  sudoku: SudokuStats;
  wordsearch: WordSearchStats;
  /** Friends added by their public code. */
  friends: Friend[];
  updatedAt: number; // epoch ms of last local mutation
}

export const PROFILE_VERSION = 2;

export function emptySolitaireStats(): SolitaireStats {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    bestMoves: null,
    bestTimeSeconds: null,
    currentStreak: 0,
    bestStreak: 0,
    hintsUsed: 0,
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
    biggestBet: 0,
    biggestWin: 0,
  };
}

export function emptyVideoPokerStats(): VideoPokerStats {
  return {
    handsPlayed: 0,
    handsPaid: 0,
    bestBankroll: 0,
    bestPayout: 0,
    biggestBet: 0,
  };
}

export function emptyCrosswordStats(): CrosswordStats {
  return {
    completed: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastCompletedDay: null,
    bestTimeSeconds: null,
  };
}

function emptyDailyStats(): DailyStats {
  return {
    completed: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastCompletedDay: null,
    bestTimeSeconds: null,
    hintsUsed: 0,
  };
}

export function emptySudokuStats(): SudokuStats {
  return emptyDailyStats();
}

export function emptyWordSearchStats(): WordSearchStats {
  return emptyDailyStats();
}

/** The read-only, shareable view of a profile that friends can fetch by code.
 *  Deliberately excludes the device id and settings — only comparable stats
 *  and a display name. Kept flat and self-describing so the comparison UI and
 *  the backend mirror can share one shape. */
export interface PublicProfile {
  code: string;
  displayName: string;
  updatedAt: number;
  solitaire: SolitaireStats;
  blackjack: BlackjackStats;
  videopoker: VideoPokerStats;
  crossword: CrosswordStats;
  sudoku: SudokuStats;
  wordsearch: WordSearchStats;
}

/** Build the public view from a full profile. Copies only comparable stats. */
export function toPublicProfile(p: Profile): PublicProfile {
  return {
    code: p.friendCode,
    displayName: p.displayName,
    updatedAt: p.updatedAt,
    solitaire: p.solitaire,
    blackjack: p.blackjack,
    videopoker: p.videopoker,
    crossword: p.crossword,
    sudoku: p.sudoku,
    wordsearch: p.wordsearch,
  };
}

export function defaultProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    displayName: "",
    friendCode: "",
    friends: [],
    settings: {
      soundEnabled: true,
      solitaireDrawCount: 3,
      solitaireAutoFinish: true,
      sudokuDifficulty: "regular",
      sudokuHighlightSame: true,
      wordsearchDifficulty: "medium",
    },
    solitaire: emptySolitaireStats(),
    blackjack: emptyBlackjackStats(),
    videopoker: emptyVideoPokerStats(),
    crossword: emptyCrosswordStats(),
    sudoku: emptySudokuStats(),
    wordsearch: emptyWordSearchStats(),
    updatedAt: 0,
  };
}

/** Merge two profiles, preferring the more recently updated one.
 *  Used when reconciling a cloud copy with the local copy.
 *
 *  Stats/settings follow whole-object last-writer-wins by `updatedAt`. The
 *  friend code is the one exception: it's a stable public identity, so once
 *  either copy has assigned one we keep it (preferring the winner's, falling
 *  back to the loser's) rather than letting an older blank clobber it. */
export function mergeProfiles(a: Profile, b: Profile): Profile {
  const winner = b.updatedAt > a.updatedAt ? b : a;
  const loser = winner === a ? b : a;
  const friendCode = winner.friendCode || loser.friendCode;
  return friendCode === winner.friendCode ? winner : { ...winner, friendCode };
}

// Friend codes: short, human-shareable, unambiguous. We avoid easily-confused
// characters (0/O, 1/I/L) so codes read cleanly aloud or on paper. Formatted as
// two 4-char groups, e.g. "7XK9-2MH4".
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Generate a new random friend code like "7XK9-2MH4". */
export function generateFriendCode(): string {
  const pick = () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  let out = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) out += "-";
    out += pick();
  }
  return out;
}

/** Normalize user-entered codes: uppercase, strip spaces, enforce the dash.
 *  Returns null if it doesn't look like a valid 8-char code. */
export function normalizeFriendCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== 8) return null;
  for (const ch of cleaned) {
    if (!CODE_ALPHABET.includes(ch)) return null;
  }
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}
