import { describe, expect, it } from "vitest";
import { type Card, createDeck } from "../../lib/cards";
import {
  type BlackjackState,
  canDouble,
  canSplit,
  double,
  handValue,
  hit,
  isBlackjack,
  split,
  stand,
} from "./logic";

const deck = createDeck(true);
const c = (rank: string, suit: string): Card => ({
  ...deck.find((x) => x.rank === rank && x.suit === suit)!,
});

/** Build a mid-hand state. Shoe pops from the END (last element drawn first). */
function state(opts: {
  player: [string, string][];
  dealerUp: [string, string];
  dealerDown: [string, string];
  shoeTop: [string, string][]; // last is drawn first
  bankroll?: number;
  bet?: number;
}): BlackjackState {
  const bet = opts.bet ?? 25;
  return {
    shoe: opts.shoeTop.map(([r, s]) => c(r, s)),
    hands: [
      { cards: opts.player.map(([r, s]) => c(r, s)), bet, done: false, outcome: null },
    ],
    activeHand: 0,
    dealer: [
      c(opts.dealerUp[0], opts.dealerUp[1]),
      { ...c(opts.dealerDown[0], opts.dealerDown[1]), faceUp: false },
    ],
    phase: "player",
    bankroll: opts.bankroll ?? 500,
    bet,
  };
}

describe("handValue", () => {
  it("counts aces as 11 when it fits", () => {
    expect(handValue([c("A", "spades"), c("7", "hearts")])).toBe(18); // soft 18
  });
  it("reduces aces to 1 to avoid busting", () => {
    expect(handValue([c("A", "spades"), c("7", "hearts"), c("5", "clubs")])).toBe(13);
  });
  it("counts multiple aces correctly", () => {
    expect(handValue([c("A", "spades"), c("A", "hearts"), c("9", "clubs")])).toBe(21);
  });
  it("face cards are 10", () => {
    expect(handValue([c("K", "spades"), c("Q", "hearts")])).toBe(20);
  });
});

describe("isBlackjack", () => {
  it("is a natural on a two-card 21", () => {
    expect(isBlackjack([c("A", "spades"), c("K", "hearts")])).toBe(true);
  });
  it("is not a blackjack on a three-card 21", () => {
    expect(
      isBlackjack([c("7", "spades"), c("7", "hearts"), c("7", "clubs")]),
    ).toBe(false);
  });
});

describe("hit / auto-stand", () => {
  it("hitting to 21 ends the hand (auto-stand)", () => {
    const s = state({
      player: [["10", "spades"], ["6", "hearts"]],
      dealerUp: ["9", "clubs"],
      dealerDown: ["7", "diamonds"],
      shoeTop: [["9", "clubs"], ["5", "clubs"]], // draw 5 -> 21
    });
    const next = hit(s);
    expect(handValue(next.hands[0].cards)).toBe(21);
    expect(next.hands[0].done).toBe(true);
  });

  it("busting ends the hand and it settles as a loss", () => {
    const s = state({
      player: [["10", "spades"], ["9", "hearts"]],
      dealerUp: ["9", "clubs"],
      dealerDown: ["7", "diamonds"],
      shoeTop: [["8", "clubs"]], // draw 8 -> 27 bust
      bankroll: 475,
    });
    const next = hit(s);
    expect(next.phase).toBe("settled");
    expect(next.hands[0].outcome).toBe("player_bust");
  });
});

describe("settlement payouts", () => {
  it("a win pays 2x the bet back into bankroll", () => {
    // Player 19, dealer 16 draws 7 -> 23 bust.
    const s = state({
      player: [["10", "spades"], ["9", "hearts"]],
      dealerUp: ["6", "clubs"],
      dealerDown: ["10", "diamonds"],
      shoeTop: [["7", "clubs"]],
      bankroll: 475, // bet already deducted
      bet: 25,
    });
    const next = stand(s);
    expect(next.hands[0].outcome).toBe("dealer_bust");
    expect(next.bankroll).toBe(525); // 475 + 25 back + 25 winnings
  });

  it("a push returns the bet", () => {
    const s = state({
      player: [["10", "spades"], ["8", "hearts"]], // 18
      dealerUp: ["10", "clubs"],
      dealerDown: ["8", "diamonds"], // dealer 18
      shoeTop: [],
      bankroll: 475,
    });
    const next = stand(s);
    expect(next.hands[0].outcome).toBe("push");
    expect(next.bankroll).toBe(500); // bet returned
  });
});

describe("split", () => {
  it("can split a matching pair with enough bankroll", () => {
    const s = state({
      player: [["8", "spades"], ["8", "hearts"]],
      dealerUp: ["6", "clubs"],
      dealerDown: ["5", "diamonds"],
      shoeTop: [["2", "clubs"], ["3", "clubs"]],
      bankroll: 500,
      bet: 25,
    });
    expect(canSplit(s)).toBe(true);
    const next = split(s);
    expect(next.hands.length).toBe(2);
    expect(next.bankroll).toBe(475); // second bet committed
    expect(next.hands[0].cards.length).toBe(2);
    expect(next.hands[1].cards.length).toBe(2);
  });

  it("cannot split unmatched cards", () => {
    const s = state({
      player: [["8", "spades"], ["9", "hearts"]],
      dealerUp: ["6", "clubs"],
      dealerDown: ["5", "diamonds"],
      shoeTop: [],
    });
    expect(canSplit(s)).toBe(false);
  });

  it("split aces get one card each and lock", () => {
    const s = state({
      player: [["A", "spades"], ["A", "hearts"]],
      dealerUp: ["9", "clubs"],
      dealerDown: ["7", "diamonds"],
      shoeTop: [["6", "clubs"], ["9", "clubs"], ["5", "clubs"]],
      bankroll: 500,
    });
    const next = split(s);
    // Both hands locked -> dealer plays -> settled.
    expect(next.phase).toBe("settled");
    expect(next.hands.every((h) => h.done)).toBe(true);
  });
});

describe("double", () => {
  it("doubles the bet, draws exactly one card, and settles the doubled wager", () => {
    // Player 5+6=11, doubles and draws a 9 -> 20. Dealer 16 then draws a 10 ->
    // 26 bust, so the player wins the doubled bet.
    const s = state({
      player: [["5", "spades"], ["6", "hearts"]],
      dealerUp: ["6", "clubs"],
      dealerDown: ["10", "diamonds"],
      shoeTop: [["10", "clubs"], ["9", "clubs"]], // player draws 9, dealer draws 10
      bankroll: 475, // original bet already deducted
      bet: 25,
    });
    expect(canDouble(s)).toBe(true);
    const next = double(s);
    expect(next.hands[0].bet).toBe(50); // doubled
    expect(next.hands[0].cards.length).toBe(3); // exactly one extra card
    expect(next.phase).toBe("settled");
    expect(next.hands[0].outcome).toBe("dealer_bust");
    // Started 475, doubled (−25 → 450), win pays back 2×50 = 100 → 550.
    expect(next.bankroll).toBe(550);
  });

  it("cannot double after more than two cards", () => {
    const s = state({
      player: [["5", "spades"], ["6", "hearts"]],
      dealerUp: ["9", "clubs"],
      dealerDown: ["7", "diamonds"],
      shoeTop: [["2", "clubs"]],
    });
    const afterHit = hit(s); // now 3 cards
    expect(canDouble(afterHit)).toBe(false);
  });
});
