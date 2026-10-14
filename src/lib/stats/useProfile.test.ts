import { beforeEach, describe, expect, it } from "vitest";
import { profileStore } from "./store";
import {
  addFriend,
  clearProfile,
  ensureFriendCode,
  recordBlackjackHand,
  recordCrosswordComplete,
  recordHintUsed,
  recordSolitaireResult,
  recordSudokuComplete,
  recordVideoPokerHand,
  recordWordSearchComplete,
  removeFriend,
  setDisplayName,
} from "./useProfile";

// The store is a localStorage-backed singleton; reset it to defaults before
// each test. clearProfile() sets defaults synchronously (the await only covers
// the no-op remote delete, which is disabled without a backend in tests).
beforeEach(async () => {
  localStorage.clear();
  await clearProfile();
});

describe("recordHintUsed", () => {
  it("increments the per-game hint counter", () => {
    recordHintUsed("solitaire");
    recordHintUsed("solitaire");
    recordHintUsed("sudoku");
    expect(profileStore.getProfile().solitaire.hintsUsed).toBe(2);
    expect(profileStore.getProfile().sudoku.hintsUsed).toBe(1);
  });
});

describe("recordSolitaireResult", () => {
  it("tracks wins, streaks, best moves and best time", () => {
    recordSolitaireResult({ won: true, moves: 120, timeSeconds: 300 });
    recordSolitaireResult({ won: true, moves: 90, timeSeconds: 400 });
    const s = profileStore.getProfile().solitaire;
    expect(s.gamesWon).toBe(2);
    expect(s.gamesPlayed).toBe(2);
    expect(s.bestMoves).toBe(90); // fewer is better
    expect(s.bestTimeSeconds).toBe(300); // faster is better
    expect(s.currentStreak).toBe(2);
  });

  it("resets the current streak on a loss", () => {
    recordSolitaireResult({ won: true, moves: 100, timeSeconds: 100 });
    recordSolitaireResult({ won: false, moves: 50, timeSeconds: 50 });
    const s = profileStore.getProfile().solitaire;
    expect(s.currentStreak).toBe(0);
    expect(s.bestStreak).toBe(1);
    expect(s.gamesPlayed).toBe(2);
  });
});

describe("recordBlackjackHand", () => {
  it("records biggest bet and biggest win high-water marks", () => {
    recordBlackjackHand("win", 150, { bet: 25, netWin: 25 });
    recordBlackjackHand("blackjack", 300, { bet: 50, netWin: 75 });
    recordBlackjackHand("loss", 250, { bet: 100, netWin: 0 });
    const b = profileStore.getProfile().blackjack;
    expect(b.handsPlayed).toBe(3);
    expect(b.wins).toBe(2); // win + blackjack
    expect(b.blackjacks).toBe(1);
    expect(b.biggestBet).toBe(100); // the losing hand had the biggest wager
    expect(b.biggestWin).toBe(75); // the blackjack paid the most
    expect(b.bestBankroll).toBe(300);
  });
});

describe("recordVideoPokerHand", () => {
  it("tracks best payout, best bankroll, and biggest bet", () => {
    recordVideoPokerHand({ paid: true, payout: 20, bankroll: 320, bet: 5 });
    recordVideoPokerHand({ paid: false, payout: 0, bankroll: 315, bet: 25 });
    const v = profileStore.getProfile().videopoker;
    expect(v.handsPlayed).toBe(2);
    expect(v.handsPaid).toBe(1);
    expect(v.bestPayout).toBe(20);
    expect(v.bestBankroll).toBe(320);
    expect(v.biggestBet).toBe(25);
  });
});

describe("daily completion best-time tracking", () => {
  it("records a crossword completion with its time and streak", () => {
    recordCrosswordComplete(100, 240);
    const c = profileStore.getProfile().crossword;
    expect(c.completed).toBe(1);
    expect(c.currentStreak).toBe(1);
    expect(c.bestTimeSeconds).toBe(240);
    expect(c.lastCompletedDay).toBe(100);
  });

  it("does not double-count the same day, but a faster time still lands", () => {
    recordCrosswordComplete(100, 240);
    recordCrosswordComplete(100, 180); // same day, faster
    const c = profileStore.getProfile().crossword;
    expect(c.completed).toBe(1); // still one completion
    expect(c.bestTimeSeconds).toBe(180); // faster time recorded
  });

  it("ignores a slower repeat time", () => {
    recordSudokuComplete(10, 120);
    recordSudokuComplete(10, 300); // slower, same day
    expect(profileStore.getProfile().sudoku.bestTimeSeconds).toBe(120);
  });

  it("extends the streak on consecutive days and keeps the fastest overall", () => {
    recordWordSearchComplete(5, 90);
    recordWordSearchComplete(6, 60);
    recordWordSearchComplete(7, 75);
    const w = profileStore.getProfile().wordsearch;
    expect(w.completed).toBe(3);
    expect(w.currentStreak).toBe(3);
    expect(w.bestTimeSeconds).toBe(60);
  });

  it("resets the streak when a day is skipped", () => {
    recordSudokuComplete(1, 100);
    recordSudokuComplete(3, 100); // gap -> streak restarts
    const su = profileStore.getProfile().sudoku;
    expect(su.completed).toBe(2);
    expect(su.currentStreak).toBe(1);
    expect(su.bestStreak).toBe(1);
  });
});

describe("friends and display name", () => {
  it("assigns a friend code lazily and keeps it stable", () => {
    expect(profileStore.getProfile().friendCode).toBe("");
    const code = ensureFriendCode();
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(ensureFriendCode()).toBe(code); // idempotent
  });

  it("setting a display name also makes the profile shareable", () => {
    setDisplayName("  Jordan  ");
    const p = profileStore.getProfile();
    expect(p.displayName).toBe("Jordan"); // trimmed
    expect(p.friendCode).not.toBe("");
  });

  it("adds, dedupes, and removes friends and refuses your own code", () => {
    const mine = ensureFriendCode();
    expect(addFriend(mine)).toBeNull(); // can't friend yourself
    expect(addFriend("not-a-code")).toBeNull();

    const added = addFriend("7xk9-2mh4", "Sam");
    expect(added).toBe("7XK9-2MH4");
    expect(profileStore.getProfile().friends).toHaveLength(1);

    // Adding the same code again doesn't duplicate.
    addFriend("7XK9-2MH4");
    expect(profileStore.getProfile().friends).toHaveLength(1);

    removeFriend("7XK9-2MH4");
    expect(profileStore.getProfile().friends).toHaveLength(0);
  });
});
