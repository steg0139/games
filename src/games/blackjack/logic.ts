// Pure Blackjack game logic. No React, no DOM.
// Supports splitting into multiple hands (one level, no re-split).
import { type Card, type Rank, createDeck, shuffle } from "../../lib/cards";

export type Phase = "betting" | "player" | "dealer" | "settled";

export type Outcome =
  | "player_blackjack"
  | "player_win"
  | "dealer_win"
  | "push"
  | "player_bust"
  | "dealer_bust";

export interface PlayerHand {
  cards: Card[];
  bet: number;
  done: boolean; // stood, busted, or locked (split aces)
  outcome: Outcome | null; // set at settlement
}

export interface BlackjackState {
  shoe: Card[]; // remaining cards to draw
  hands: PlayerHand[]; // one or more player hands (>1 after a split)
  activeHand: number; // index of the hand currently being played
  dealer: Card[];
  phase: Phase;
  bankroll: number;
  bet: number; // the wager selected during the betting phase
}

export const STARTING_BANKROLL = 500;
export const MIN_BET = 5;
const DEFAULT_BET = 25;
const BLACKJACK_PAYOUT = 1.5; // 3:2 on a natural

/** Card value; Aces counted as 11 here and adjusted in handValue. */
function baseValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (rank === "K" || rank === "Q" || rank === "J" || rank === "10") return 10;
  return Number(rank);
}

/** Best hand total, reducing Aces from 11 to 1 as needed to avoid bust. */
export function handValue(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += baseValue(c.rank);
    if (c.rank === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

/** A natural blackjack: two cards totaling 21, on the initial (unsplit) hand. */
export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards) === 21;
}

/** A fresh 4-deck shoe, shuffled and face up. */
function freshShoe(): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < 4; i++) cards.push(...createDeck(true));
  return shuffle(cards);
}

export function newGame(bankroll: number = STARTING_BANKROLL): BlackjackState {
  return {
    shoe: freshShoe(),
    hands: [],
    activeHand: 0,
    dealer: [],
    phase: "betting",
    bankroll,
    bet: DEFAULT_BET,
  };
}

/** Reshuffle a new shoe if it's running low. */
function ensureShoe(shoe: Card[]): Card[] {
  return shoe.length < 15 ? freshShoe() : shoe;
}

export function setBet(state: BlackjackState, bet: number): BlackjackState {
  if (state.phase !== "betting") return state;
  const clamped = Math.max(MIN_BET, Math.min(bet, state.bankroll));
  return { ...state, bet: clamped };
}

function mkHand(cards: Card[], bet: number): PlayerHand {
  return { cards, bet, done: false, outcome: null };
}

/** Deal opening hands: player two up, dealer one up + one down. */
export function deal(state: BlackjackState): BlackjackState {
  if (state.phase !== "betting") return state;
  if (state.bankroll < state.bet) return state;

  const shoe = ensureShoe(state.shoe).slice();
  const playerCards = [shoe.pop()!, shoe.pop()!];
  const dealer = [shoe.pop()!, { ...shoe.pop()!, faceUp: false }];

  // Wager is committed now; payouts add winnings back at settlement.
  const bankroll = state.bankroll - state.bet;
  const hand = mkHand(playerCards, state.bet);

  const playerBJ = isBlackjack(playerCards);
  const dealerBJ = handValue(dealer) === 21;

  // If either has a natural, resolve immediately.
  if (playerBJ || dealerBJ) {
    const revealed = dealer.map((c) => ({ ...c, faceUp: true }));
    let settledBankroll = bankroll;
    if (playerBJ && dealerBJ) {
      hand.outcome = "push";
      settledBankroll += hand.bet; // wager returned
    } else if (playerBJ) {
      hand.outcome = "player_blackjack";
      settledBankroll += hand.bet + Math.floor(hand.bet * BLACKJACK_PAYOUT);
    } else {
      hand.outcome = "dealer_win"; // dealer natural
    }
    hand.done = true;
    return {
      ...state,
      shoe,
      hands: [hand],
      activeHand: 0,
      dealer: revealed,
      phase: "settled",
      bankroll: settledBankroll,
    };
  }

  return {
    ...state,
    shoe,
    hands: [hand],
    activeHand: 0,
    dealer,
    phase: "player",
    bankroll,
  };
}

/** Can the active hand be split? Two equal-rank cards and bankroll for the bet. */
export function canSplit(state: BlackjackState): boolean {
  if (state.phase !== "player") return false;
  if (state.hands.length !== 1) return false; // no re-split
  const hand = state.hands[0];
  if (hand.cards.length !== 2) return false;
  if (hand.cards[0].rank !== hand.cards[1].rank) return false;
  return state.bankroll >= hand.bet;
}

/** Advance to the next unfinished hand, or move to the dealer if none remain. */
function advance(state: BlackjackState): BlackjackState {
  const next = state.hands.findIndex((h, i) => i > state.activeHand && !h.done);
  if (next !== -1) {
    return { ...state, activeHand: next };
  }
  // All hands done — dealer plays and everything settles.
  return settle({ ...state, phase: "dealer" });
}

export function split(state: BlackjackState): BlackjackState {
  if (!canSplit(state)) return state;

  const shoe = state.shoe.slice();
  const [a, b] = state.hands[0].cards;
  const bet = state.hands[0].bet;
  const isAces = a.rank === "A";

  const hand1 = mkHand([a, shoe.pop()!], bet);
  const hand2 = mkHand([b, shoe.pop()!], bet);

  // Split aces receive exactly one card each and are then locked.
  if (isAces) {
    hand1.done = true;
    hand2.done = true;
  }

  const next: BlackjackState = {
    ...state,
    shoe,
    hands: [hand1, hand2],
    activeHand: 0,
    bankroll: state.bankroll - bet, // second wager committed
  };

  // If aces (both locked) or a hand hit 21, move things along.
  return maybeAutoAdvance(next);
}

/** Hit the active hand. Auto-advances on bust or on reaching 21. */
export function hit(state: BlackjackState): BlackjackState {
  if (state.phase !== "player") return state;
  const hand = state.hands[state.activeHand];
  if (hand.done) return state;

  const shoe = state.shoe.slice();
  const cards = [...hand.cards, shoe.pop()!];
  const hands = state.hands.slice();
  hands[state.activeHand] = { ...hand, cards };

  const total = handValue(cards);
  if (total >= 21) {
    // Bust or 21 both end this hand's turn.
    hands[state.activeHand].done = true;
  }

  const next = { ...state, shoe, hands };
  return maybeAutoAdvance(next);
}

/** Stand the active hand and advance. */
export function stand(state: BlackjackState): BlackjackState {
  if (state.phase !== "player") return state;
  const hands = state.hands.slice();
  hands[state.activeHand] = { ...hands[state.activeHand], done: true };
  return advance({ ...state, hands });
}

/** If the active hand is finished, move to the next hand or the dealer. */
function maybeAutoAdvance(state: BlackjackState): BlackjackState {
  if (state.hands[state.activeHand]?.done) {
    return advance(state);
  }
  return state;
}

/** Dealer draws to 17, then settle every hand. Called once all hands are done. */
function settle(state: BlackjackState): BlackjackState {
  const shoe = state.shoe.slice();
  const dealer = state.dealer.map((c) => ({ ...c, faceUp: true }));

  // Dealer only draws if at least one hand hasn't busted.
  const anyLive = state.hands.some((h) => handValue(h.cards) <= 21);
  if (anyLive) {
    while (handValue(dealer) < 17) {
      dealer.push(shoe.pop()!);
    }
  }
  const dealerTotal = handValue(dealer);
  const dealerBust = dealerTotal > 21;

  let bankroll = state.bankroll;
  const hands = state.hands.map((h) => {
    const total = handValue(h.cards);
    let outcome: Outcome;
    if (total > 21) {
      outcome = "player_bust";
    } else if (dealerBust) {
      outcome = "dealer_bust";
      bankroll += h.bet * 2; // wager back + equal winnings
    } else if (total > dealerTotal) {
      outcome = "player_win";
      bankroll += h.bet * 2;
    } else if (total < dealerTotal) {
      outcome = "dealer_win";
    } else {
      outcome = "push";
      bankroll += h.bet; // wager returned
    }
    return { ...h, outcome, done: true };
  });

  return { ...state, shoe, dealer, hands, phase: "settled", bankroll };
}

/** Move a settled round back to betting, keeping bankroll and shoe. */
export function nextRound(state: BlackjackState): BlackjackState {
  if (state.phase !== "settled") return state;
  return {
    ...state,
    shoe: ensureShoe(state.shoe),
    hands: [],
    activeHand: 0,
    dealer: [],
    phase: "betting",
    bet: Math.min(state.bet, Math.max(MIN_BET, state.bankroll)),
  };
}

const OUTCOME_TEXT: Record<Outcome, string> = {
  player_blackjack: "Blackjack! 3:2",
  player_win: "Win",
  dealer_win: "Dealer wins",
  push: "Push",
  player_bust: "Bust",
  dealer_bust: "Dealer busts",
};

export function outcomeText(outcome: Outcome): string {
  return OUTCOME_TEXT[outcome];
}
