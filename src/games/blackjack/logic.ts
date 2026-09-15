// Pure Blackjack game logic. No React, no DOM.
import { type Card, type Rank, createDeck, shuffle } from "../../lib/cards";

export type Phase = "betting" | "player" | "dealer" | "settled";

export type Outcome =
  | "player_blackjack"
  | "player_win"
  | "dealer_win"
  | "push"
  | "player_bust"
  | "dealer_bust";

export interface BlackjackState {
  shoe: Card[]; // remaining cards to draw
  player: Card[];
  dealer: Card[];
  phase: Phase;
  outcome: Outcome | null;
  bankroll: number;
  bet: number;
}

const STARTING_BANKROLL = 500;
const DEFAULT_BET = 25;

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

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards) === 21;
}

/** A fresh 4-deck shoe, shuffled and face up. */
function freshShoe(): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < 4; i++) cards.push(...createDeck(true));
  return shuffle(cards);
}

export function newGame(): BlackjackState {
  return {
    shoe: freshShoe(),
    player: [],
    dealer: [],
    phase: "betting",
    outcome: null,
    bankroll: STARTING_BANKROLL,
    bet: DEFAULT_BET,
  };
}

/** Reshuffle a new shoe if it's running low. */
function ensureShoe(shoe: Card[]): Card[] {
  return shoe.length < 15 ? freshShoe() : shoe;
}

export function setBet(state: BlackjackState, bet: number): BlackjackState {
  if (state.phase !== "betting") return state;
  const clamped = Math.max(5, Math.min(bet, state.bankroll));
  return { ...state, bet: clamped };
}

/** Deal opening hands: player two up, dealer one up + one down. */
export function deal(state: BlackjackState): BlackjackState {
  if (state.phase !== "betting") return state;
  if (state.bankroll < state.bet) return state;

  const shoe = ensureShoe(state.shoe).slice();
  const player = [shoe.pop()!, shoe.pop()!];
  const dealer = [shoe.pop()!, { ...shoe.pop()!, faceUp: false }];

  let phase: Phase = "player";
  let outcome: BlackjackState["outcome"] = null;
  let bankroll = state.bankroll;

  // Natural blackjack check.
  const playerBJ = isBlackjack(player);
  const dealerBJ = handValue(dealer) === 21;

  if (playerBJ || dealerBJ) {
    dealer[1] = { ...dealer[1], faceUp: true };
    phase = "settled";
    if (playerBJ && dealerBJ) {
      outcome = "push"; // bet returned
    } else if (playerBJ) {
      outcome = "player_blackjack";
      bankroll += Math.floor(state.bet * 1.5); // 3:2 payout
    } else {
      outcome = "dealer_win";
      bankroll -= state.bet;
    }
  }

  return { ...state, shoe, player, dealer, phase, outcome, bankroll };
}

export function hit(state: BlackjackState): BlackjackState {
  if (state.phase !== "player") return state;
  const shoe = state.shoe.slice();
  const player = [...state.player, shoe.pop()!];

  if (handValue(player) > 21) {
    return {
      ...state,
      shoe,
      player,
      phase: "settled",
      outcome: "player_bust",
      bankroll: state.bankroll - state.bet,
    };
  }
  return { ...state, shoe, player };
}

/** Player stands; dealer reveals and draws to 17 (stands on soft 17). */
export function stand(state: BlackjackState): BlackjackState {
  if (state.phase !== "player") return state;

  const shoe = state.shoe.slice();
  const dealer = state.dealer.map((c) => ({ ...c, faceUp: true }));

  while (handValue(dealer) < 17) {
    dealer.push(shoe.pop()!);
  }

  const playerTotal = handValue(state.player);
  const dealerTotal = handValue(dealer);

  let outcome: Outcome;
  let bankroll = state.bankroll;

  if (dealerTotal > 21) {
    outcome = "dealer_bust";
    bankroll += state.bet;
  } else if (dealerTotal > playerTotal) {
    outcome = "dealer_win";
    bankroll -= state.bet;
  } else if (dealerTotal < playerTotal) {
    outcome = "player_win";
    bankroll += state.bet;
  } else {
    outcome = "push";
  }

  return { ...state, shoe, dealer, phase: "settled", outcome, bankroll };
}

/** Move a settled round back to betting, keeping bankroll and shoe. */
export function nextRound(state: BlackjackState): BlackjackState {
  if (state.phase !== "settled") return state;
  return {
    ...state,
    shoe: ensureShoe(state.shoe),
    player: [],
    dealer: [],
    phase: "betting",
    outcome: null,
    bet: Math.min(state.bet, Math.max(5, state.bankroll)),
  };
}

const OUTCOME_TEXT: Record<Outcome, string> = {
  player_blackjack: "Blackjack! You win 3:2",
  player_win: "You win",
  dealer_win: "Dealer wins",
  push: "Push — bet returned",
  player_bust: "Bust! You lose",
  dealer_bust: "Dealer busts — you win",
};

export function outcomeText(outcome: Outcome): string {
  return OUTCOME_TEXT[outcome];
}
