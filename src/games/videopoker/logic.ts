// Pure Video Poker (Jacks or Better) logic. No React, no DOM.
import { type Card, type Rank, RANKS, createDeck, shuffle } from "../../lib/cards";

export type Phase = "betting" | "draw" | "result";

// Ranked hand categories, best to worst. "none" pays nothing.
export type HandRank =
  | "royal_flush"
  | "straight_flush"
  | "four_kind"
  | "full_house"
  | "flush"
  | "straight"
  | "three_kind"
  | "two_pair"
  | "jacks_or_better"
  | "none";

export interface VideoPokerState {
  deck: Card[]; // remaining draw pile
  hand: Card[]; // the 5 cards
  held: boolean[]; // which of the 5 are held
  phase: Phase;
  bankroll: number;
  bet: number;
  result: HandRank | null; // set after the draw
  payout: number; // chips won on the last result (0 if none)
}

export const STARTING_BANKROLL = 300;
export const MIN_BET = 5;
const DEFAULT_BET = 5;

// Payout multiples (× bet) for Jacks or Better. Standard 9/6 table.
export const PAYTABLE: { rank: HandRank; label: string; mult: number }[] = [
  { rank: "royal_flush", label: "Royal Flush", mult: 800 },
  { rank: "straight_flush", label: "Straight Flush", mult: 50 },
  { rank: "four_kind", label: "Four of a Kind", mult: 25 },
  { rank: "full_house", label: "Full House", mult: 9 },
  { rank: "flush", label: "Flush", mult: 6 },
  { rank: "straight", label: "Straight", mult: 4 },
  { rank: "three_kind", label: "Three of a Kind", mult: 3 },
  { rank: "two_pair", label: "Two Pair", mult: 2 },
  { rank: "jacks_or_better", label: "Jacks or Better", mult: 1 },
  { rank: "none", label: "—", mult: 0 },
];

export function payoutMultiplier(rank: HandRank): number {
  return PAYTABLE.find((p) => p.rank === rank)?.mult ?? 0;
}

export function rankLabel(rank: HandRank): string {
  return PAYTABLE.find((p) => p.rank === rank)?.label ?? "";
}

export function newGame(bankroll: number = STARTING_BANKROLL): VideoPokerState {
  return {
    deck: [],
    hand: [],
    held: [false, false, false, false, false],
    phase: "betting",
    bankroll,
    bet: DEFAULT_BET,
    result: null,
    payout: 0,
  };
}

export function setBet(state: VideoPokerState, bet: number): VideoPokerState {
  if (state.phase !== "betting") return state;
  const clamped = Math.max(MIN_BET, Math.min(bet, state.bankroll));
  return { ...state, bet: clamped };
}

/** Deal a fresh 5-card hand; commit the wager. */
export function deal(state: VideoPokerState): VideoPokerState {
  if (state.phase !== "betting") return state;
  if (state.bankroll < state.bet) return state;

  const deck = shuffle(createDeck(true));
  const hand = deck.splice(0, 5);
  return {
    ...state,
    deck,
    hand,
    held: [false, false, false, false, false],
    phase: "draw",
    bankroll: state.bankroll - state.bet,
    result: null,
    payout: 0,
  };
}

export function toggleHold(state: VideoPokerState, index: number): VideoPokerState {
  if (state.phase !== "draw") return state;
  const held = state.held.slice();
  held[index] = !held[index];
  return { ...state, held };
}

/** Replace non-held cards, evaluate, and pay out. */
export function draw(state: VideoPokerState): VideoPokerState {
  if (state.phase !== "draw") return state;

  const deck = state.deck.slice();
  const hand = state.hand.map((card, i) =>
    state.held[i] ? card : deck.pop()!,
  );

  const result = evaluate(hand);
  const payout = payoutMultiplier(result) * state.bet;

  return {
    ...state,
    deck,
    hand,
    phase: "result",
    result,
    payout,
    bankroll: state.bankroll + payout,
  };
}

/** Back to betting for the next hand. */
export function nextHand(state: VideoPokerState): VideoPokerState {
  if (state.phase !== "result") return state;
  return {
    ...state,
    hand: [],
    held: [false, false, false, false, false],
    phase: "betting",
    result: null,
    payout: 0,
    bet: Math.min(state.bet, Math.max(MIN_BET, state.bankroll)),
  };
}

// ---- Hand evaluation -----------------------------------------------------

function rankIndex(rank: Rank): number {
  return RANKS.indexOf(rank); // A=0, 2=1, ... K=12
}

/** Evaluate a 5-card hand into its best Jacks-or-Better category. */
export function evaluate(cards: Card[]): HandRank {
  if (cards.length !== 5) return "none";

  const counts = new Map<Rank, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const countValues = [...counts.values()].sort((a, b) => b - a);

  const isFlush = cards.every((c) => c.suit === cards[0].suit);

  // Straight detection. Ace can be high (10-J-Q-K-A) or low (A-2-3-4-5).
  const idxs = [...new Set(cards.map((c) => rankIndex(c.rank)))].sort(
    (a, b) => a - b,
  );
  let isStraight = false;
  if (idxs.length === 5) {
    if (idxs[4] - idxs[0] === 4) isStraight = true;
    // Wheel: A(0),2(1),3(2),4(3),5(4) — indices already 0..4, handled above.
    // Ace-high straight: 10(9),J(10),Q(11),K(12),A(0)
    const set = new Set(idxs);
    if (set.has(0) && set.has(9) && set.has(10) && set.has(11) && set.has(12)) {
      isStraight = true;
    }
  }

  const isRoyal =
    isFlush &&
    isStraight &&
    [0, 9, 10, 11, 12].every((i) => idxs.includes(i));

  if (isRoyal) return "royal_flush";
  if (isStraight && isFlush) return "straight_flush";
  if (countValues[0] === 4) return "four_kind";
  if (countValues[0] === 3 && countValues[1] === 2) return "full_house";
  if (isFlush) return "flush";
  if (isStraight) return "straight";
  if (countValues[0] === 3) return "three_kind";
  if (countValues[0] === 2 && countValues[1] === 2) return "two_pair";

  // Jacks or better: a single pair of J, Q, K, or A.
  if (countValues[0] === 2) {
    for (const [rank, count] of counts) {
      if (count === 2) {
        const i = rankIndex(rank);
        // Paying pairs: A (index 0) or J/Q/K (10,11,12).
        if (i === 0 || i >= 10) return "jacks_or_better";
      }
    }
  }

  return "none";
}
