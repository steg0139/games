import { describe, expect, it } from "vitest";
import { type Card, createDeck } from "../../lib/cards";
import {
  type VideoPokerState,
  MIN_BET,
  deal,
  draw,
  evaluate,
  newGame,
  payoutMultiplier,
  setBet,
  toggleHold,
} from "./logic";

const deck = createDeck(true);
const c = (rank: string, suit: string): Card => ({
  ...deck.find((x) => x.rank === rank && x.suit === suit)!,
});

describe("evaluate", () => {
  const cases: [string, Card[], string][] = [
    ["royal flush", [c("10", "spades"), c("J", "spades"), c("Q", "spades"), c("K", "spades"), c("A", "spades")], "royal_flush"],
    ["straight flush", [c("5", "hearts"), c("6", "hearts"), c("7", "hearts"), c("8", "hearts"), c("9", "hearts")], "straight_flush"],
    ["four of a kind", [c("9", "spades"), c("9", "hearts"), c("9", "clubs"), c("9", "diamonds"), c("2", "spades")], "four_kind"],
    ["full house", [c("3", "spades"), c("3", "hearts"), c("3", "clubs"), c("K", "spades"), c("K", "hearts")], "full_house"],
    ["flush", [c("2", "clubs"), c("5", "clubs"), c("8", "clubs"), c("J", "clubs"), c("K", "clubs")], "flush"],
    ["ace-low straight", [c("A", "spades"), c("2", "hearts"), c("3", "clubs"), c("4", "diamonds"), c("5", "spades")], "straight"],
    ["ace-high straight", [c("10", "spades"), c("J", "hearts"), c("Q", "clubs"), c("K", "diamonds"), c("A", "spades")], "straight"],
    ["three of a kind", [c("7", "spades"), c("7", "hearts"), c("7", "clubs"), c("2", "diamonds"), c("9", "spades")], "three_kind"],
    ["two pair", [c("4", "spades"), c("4", "hearts"), c("9", "clubs"), c("9", "diamonds"), c("K", "spades")], "two_pair"],
    ["jacks or better", [c("J", "spades"), c("J", "hearts"), c("3", "clubs"), c("6", "diamonds"), c("9", "spades")], "jacks_or_better"],
    ["low pair pays nothing", [c("5", "spades"), c("5", "hearts"), c("3", "clubs"), c("6", "diamonds"), c("9", "spades")], "none"],
    ["nothing", [c("2", "spades"), c("5", "hearts"), c("8", "clubs"), c("J", "diamonds"), c("K", "spades")], "none"],
  ];

  it.each(cases)("recognizes %s", (_name, hand, expected) => {
    expect(evaluate(hand)).toBe(expected);
  });
});

describe("payouts", () => {
  it("royal flush pays 800x, jacks-or-better 1x, none 0", () => {
    expect(payoutMultiplier("royal_flush")).toBe(800);
    expect(payoutMultiplier("jacks_or_better")).toBe(1);
    expect(payoutMultiplier("none")).toBe(0);
  });
});

describe("round flow", () => {
  it("deal commits the bet and gives 5 cards", () => {
    const s = newGame(300);
    const dealt = deal(s);
    expect(dealt.hand.length).toBe(5);
    expect(dealt.phase).toBe("draw");
    expect(dealt.bankroll).toBe(300 - dealt.bet);
  });

  it("draw evaluates and pays a winning hand", () => {
    // Force a state where the hand is already a flush and we hold everything.
    const s: VideoPokerState = {
      deck: [c("2", "hearts")],
      hand: [c("2", "clubs"), c("5", "clubs"), c("8", "clubs"), c("J", "clubs"), c("K", "clubs")],
      held: [true, true, true, true, true],
      phase: "draw",
      bankroll: 295,
      bet: 5,
      result: null,
      payout: 0,
    };
    const done = draw(s);
    expect(done.result).toBe("flush");
    expect(done.payout).toBe(5 * 6); // flush pays 6x
    expect(done.bankroll).toBe(295 + 30);
  });

  it("toggleHold flips a card's hold flag", () => {
    const s = deal(newGame(300));
    const t = toggleHold(s, 2);
    expect(t.held[2]).toBe(true);
    expect(toggleHold(t, 2).held[2]).toBe(false);
  });

  it("setBet clamps to the minimum", () => {
    const s = newGame(300);
    expect(setBet(s, 0).bet).toBe(MIN_BET);
  });
});
