// Stat catalog + ranking for the Friends leaderboard. A "board" is one game +
// one stat; players are ranked best-first for that stat. Pure and data-driven
// so it's easy to test and extend.
import type { PublicProfile } from "./types";

export type CompareGame =
  | "solitaire"
  | "blackjack"
  | "videopoker"
  | "crossword"
  | "sudoku"
  | "wordsearch";

/** A single comparable stat within a game. */
export interface StatDef {
  /** Stable id, unique within its game (used for the sub-tab key). */
  id: string;
  /** Sub-tab + column label. */
  label: string;
  /** Display string for a profile's value. */
  format: (p: PublicProfile) => string;
  /** Numeric rank key, or null when the player has no data for this stat. */
  rank: (p: PublicProfile) => number | null;
  /** Which direction wins. */
  better: "high" | "low";
}

export interface GameDef {
  id: CompareGame;
  label: string;
  stats: StatDef[];
}

function fmtTime(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  return `${m}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;
}

/** The games and the stats you can rank friends by within each. */
export const COMPARE_GAMES: GameDef[] = [
  {
    id: "solitaire",
    label: "Solitaire",
    stats: [
      {
        id: "winrate",
        label: "Win %",
        format: (p) => pct(p.solitaire.gamesWon, p.solitaire.gamesPlayed),
        rank: (p) =>
          p.solitaire.gamesPlayed === 0
            ? null
            : p.solitaire.gamesWon / p.solitaire.gamesPlayed,
        better: "high",
      },
      {
        id: "wins",
        label: "Wins",
        format: (p) => String(p.solitaire.gamesWon),
        rank: (p) => p.solitaire.gamesWon,
        better: "high",
      },
      {
        id: "besttime",
        label: "Best time",
        format: (p) => fmtTime(p.solitaire.bestTimeSeconds),
        rank: (p) => p.solitaire.bestTimeSeconds,
        better: "low",
      },
      {
        id: "moves",
        label: "Fewest moves",
        format: (p) => (p.solitaire.bestMoves ?? "—").toString(),
        rank: (p) => p.solitaire.bestMoves,
        better: "low",
      },
    ],
  },
  {
    id: "blackjack",
    label: "Blackjack",
    stats: [
      {
        id: "bankroll",
        label: "Best bankroll",
        format: (p) => `$${p.blackjack.bestBankroll}`,
        rank: (p) => p.blackjack.bestBankroll,
        better: "high",
      },
      {
        id: "biggestwin",
        label: "Biggest win",
        format: (p) => `$${p.blackjack.biggestWin}`,
        rank: (p) => p.blackjack.biggestWin,
        better: "high",
      },
      {
        id: "biggestbet",
        label: "Biggest bet",
        format: (p) => `$${p.blackjack.biggestBet}`,
        rank: (p) => p.blackjack.biggestBet,
        better: "high",
      },
      {
        id: "blackjacks",
        label: "Blackjacks",
        format: (p) => String(p.blackjack.blackjacks),
        rank: (p) => p.blackjack.blackjacks,
        better: "high",
      },
      {
        id: "winrate",
        label: "Win %",
        format: (p) => pct(p.blackjack.wins, p.blackjack.handsPlayed),
        rank: (p) =>
          p.blackjack.handsPlayed === 0
            ? null
            : p.blackjack.wins / p.blackjack.handsPlayed,
        better: "high",
      },
    ],
  },
  {
    id: "videopoker",
    label: "Video Poker",
    stats: [
      {
        id: "bankroll",
        label: "Best bankroll",
        format: (p) => `$${p.videopoker.bestBankroll}`,
        rank: (p) => p.videopoker.bestBankroll,
        better: "high",
      },
      {
        id: "payout",
        label: "Best payout",
        format: (p) => `$${p.videopoker.bestPayout}`,
        rank: (p) => p.videopoker.bestPayout,
        better: "high",
      },
      {
        id: "biggestbet",
        label: "Biggest bet",
        format: (p) => `$${p.videopoker.biggestBet}`,
        rank: (p) => p.videopoker.biggestBet,
        better: "high",
      },
      {
        id: "paidrate",
        label: "Hands paid %",
        format: (p) => pct(p.videopoker.handsPaid, p.videopoker.handsPlayed),
        rank: (p) =>
          p.videopoker.handsPlayed === 0
            ? null
            : p.videopoker.handsPaid / p.videopoker.handsPlayed,
        better: "high",
      },
    ],
  },
  {
    id: "crossword",
    label: "Crossword",
    stats: [
      {
        id: "besttime",
        label: "Best time",
        format: (p) => fmtTime(p.crossword.bestTimeSeconds),
        rank: (p) => p.crossword.bestTimeSeconds,
        better: "low",
      },
      {
        id: "streak",
        label: "Best streak",
        format: (p) => String(p.crossword.bestStreak),
        rank: (p) => p.crossword.bestStreak,
        better: "high",
      },
      {
        id: "completed",
        label: "Completed",
        format: (p) => String(p.crossword.completed),
        rank: (p) => p.crossword.completed,
        better: "high",
      },
    ],
  },
  {
    id: "sudoku",
    label: "Sudoku",
    // No "Best time" here: sudoku best times merge easy + regular, so they
    // aren't comparable across difficulties. Per-difficulty time racing lives
    // in the daily competition instead.
    stats: [
      {
        id: "hints",
        label: "Fewest hints",
        format: (p) => String(p.sudoku.hintsUsed),
        rank: (p) => p.sudoku.hintsUsed,
        better: "low",
      },
      {
        id: "streak",
        label: "Best streak",
        format: (p) => String(p.sudoku.bestStreak),
        rank: (p) => p.sudoku.bestStreak,
        better: "high",
      },
      {
        id: "completed",
        label: "Completed",
        format: (p) => String(p.sudoku.completed),
        rank: (p) => p.sudoku.completed,
        better: "high",
      },
    ],
  },
  {
    id: "wordsearch",
    label: "Word Search",
    // No "Best time" here: word search best times merge easy/medium/hard, so
    // they aren't comparable. Per-difficulty time racing lives in the daily
    // competition instead.
    stats: [
      {
        id: "streak",
        label: "Best streak",
        format: (p) => String(p.wordsearch.bestStreak),
        rank: (p) => p.wordsearch.bestStreak,
        better: "high",
      },
      {
        id: "completed",
        label: "Completed",
        format: (p) => String(p.wordsearch.completed),
        rank: (p) => p.wordsearch.completed,
        better: "high",
      },
    ],
  },
];

/** A ranked row for display. */
export interface RankedEntry {
  profile: PublicProfile;
  /** Formatted value for the active stat. */
  value: string;
  /** True when the player has no data for the active stat (sorted last). */
  noData: boolean;
}

/**
 * Rank players for one stat, best-first. Players with no data for the stat
 * sort to the bottom (keeping their input order). Pure and non-mutating.
 */
export function rankByStat(stat: StatDef, players: PublicProfile[]): RankedEntry[] {
  return players
    .map((profile, i) => {
      const r = stat.rank(profile);
      return {
        profile,
        value: stat.format(profile),
        noData: r === null,
        _key: r,
        _i: i,
      };
    })
    .sort((a, b) => {
      // No-data entries always sink below ranked ones.
      if (a.noData !== b.noData) return a.noData ? 1 : -1;
      if (a.noData && b.noData) return a._i - b._i; // stable
      const av = a._key as number;
      const bv = b._key as number;
      if (av === bv) return a._i - b._i; // stable tie-break by input order
      return stat.better === "high" ? bv - av : av - bv;
    })
    .map(({ profile, value, noData }) => ({ profile, value, noData }));
}
