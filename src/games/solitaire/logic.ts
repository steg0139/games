// Pure Klondike Solitaire game logic. No React, no DOM.
import {
  type Card,
  type Suit,
  RANKS,
  cardColor,
  createDeck,
  shuffle,
} from "../../lib/cards";

export const SUIT_ORDER: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

export interface SolitaireState {
  stock: Card[]; // face-down draw pile
  waste: Card[]; // face-up discard, top is last
  foundations: Card[][]; // 4 piles, index matches SUIT_ORDER
  tableau: Card[][]; // 7 columns
}

/** Where a card (or run of cards) lives, for moves. */
export type PileId =
  | { kind: "waste" }
  | { kind: "foundation"; index: number }
  | { kind: "tableau"; index: number };

function rankIndex(card: Card): number {
  return RANKS.indexOf(card.rank); // A=0 ... K=12
}

export function newGame(): SolitaireState {
  const deck = shuffle(createDeck(false));
  const tableau: Card[][] = [[], [], [], [], [], [], []];

  let d = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const card = { ...deck[d++] };
      card.faceUp = row === col; // only the last card in each column is face up
      tableau[col].push(card);
    }
  }

  const stock = deck.slice(d).map((c) => ({ ...c, faceUp: false }));

  return {
    stock,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
  };
}

/** Number of cards flipped from the stock per draw (Klondike draw-three). */
export const DRAW_COUNT = 3;

/**
 * Draw up to DRAW_COUNT cards from the stock to the waste (fewer if the stock
 * is nearly empty). If the stock is empty, recycle the waste back into it.
 * Only the top waste card is ever playable.
 */
export function drawFromStock(state: SolitaireState): SolitaireState {
  if (state.stock.length === 0) {
    if (state.waste.length === 0) return state;
    // recycle: waste back to stock, face down, order reset
    const stock = [...state.waste].reverse().map((c) => ({ ...c, faceUp: false }));
    return { ...state, stock, waste: [] };
  }

  const stock = state.stock.slice();
  const drawn: Card[] = [];
  for (let i = 0; i < DRAW_COUNT && stock.length > 0; i++) {
    drawn.push({ ...stock.pop()!, faceUp: true });
  }
  return { ...state, stock, waste: [...state.waste, ...drawn] };
}

function canStackOnTableau(moving: Card, target: Card | undefined): boolean {
  if (!target) {
    return moving.rank === "K"; // only Kings on empty columns
  }
  return (
    cardColor(moving.suit) !== cardColor(target.suit) &&
    rankIndex(moving) === rankIndex(target) - 1
  );
}

function canStackOnFoundation(moving: Card, pile: Card[], suit: Suit): boolean {
  if (moving.suit !== suit) return false;
  if (pile.length === 0) return moving.rank === "A";
  const top = pile[pile.length - 1];
  return rankIndex(moving) === rankIndex(top) + 1;
}

/** The face-up run starting at `cardIndex` in a tableau column, if it is a valid move group. */
function faceUpRunFrom(column: Card[], cardIndex: number): Card[] | null {
  const run = column.slice(cardIndex);
  if (run.length === 0 || run.some((c) => !c.faceUp)) return null;
  for (let i = 0; i < run.length - 1; i++) {
    if (!canStackOnTableau(run[i + 1], run[i])) return null;
  }
  return run;
}

/** Flip the top tableau card face up if needed. Mutates the passed column copy. */
function revealTop(column: Card[]): void {
  const top = column[column.length - 1];
  if (top && !top.faceUp) top.faceUp = true;
}

/**
 * Attempt to move the card at `from` (and any valid run below it) onto `to`.
 * Returns the new state, or null if the move is illegal.
 */
export function moveCard(
  state: SolitaireState,
  from: PileId,
  fromCardIndex: number,
  to: PileId,
): SolitaireState | null {
  // Gather the moving cards.
  let moving: Card[];

  if (from.kind === "waste") {
    if (state.waste.length === 0) return null;
    moving = [state.waste[state.waste.length - 1]];
  } else if (from.kind === "tableau") {
    const run = faceUpRunFrom(state.tableau[from.index], fromCardIndex);
    if (!run) return null;
    moving = run;
  } else {
    // moving from a foundation: only single top card
    const pile = state.foundations[from.index];
    if (pile.length === 0) return null;
    moving = [pile[pile.length - 1]];
  }

  const head = moving[0];

  // Validate against destination.
  if (to.kind === "foundation") {
    if (moving.length !== 1) return null;
    const suit = SUIT_ORDER[to.index];
    if (!canStackOnFoundation(head, state.foundations[to.index], suit))
      return null;
  } else if (to.kind === "tableau") {
    const col = state.tableau[to.index];
    if (!canStackOnTableau(head, col[col.length - 1])) return null;
  } else {
    return null; // cannot move onto the waste
  }

  // Build next state (deep-ish copy of affected piles).
  const next: SolitaireState = {
    stock: state.stock,
    waste: state.waste.slice(),
    foundations: state.foundations.map((p) => p.slice()),
    tableau: state.tableau.map((p) => p.slice()),
  };

  // Remove from source.
  if (from.kind === "waste") {
    next.waste.pop();
  } else if (from.kind === "tableau") {
    next.tableau[from.index] = next.tableau[from.index].slice(0, fromCardIndex);
    revealTop(next.tableau[from.index]);
  } else {
    next.foundations[from.index].pop();
  }

  // Add to destination.
  if (to.kind === "foundation") {
    next.foundations[to.index] = [...next.foundations[to.index], head];
  } else if (to.kind === "tableau") {
    next.tableau[to.index] = [...next.tableau[to.index], ...moving];
  }

  return next;
}

/**
 * Find the best automatic destination for a tap on a card.
 * Prefers foundation (for single cards), then a valid tableau column.
 */
export function autoMoveTarget(
  state: SolitaireState,
  from: PileId,
  fromCardIndex: number,
): PileId | null {
  // Determine the moving head card.
  let head: Card | undefined;
  let runLength = 1;

  if (from.kind === "waste") {
    head = state.waste[state.waste.length - 1];
  } else if (from.kind === "tableau") {
    const run = faceUpRunFrom(state.tableau[from.index], fromCardIndex);
    if (!run) return null;
    head = run[0];
    runLength = run.length;
  }
  if (!head) return null;

  // Try foundations first (single card only).
  if (runLength === 1) {
    for (let i = 0; i < 4; i++) {
      if (canStackOnFoundation(head, state.foundations[i], SUIT_ORDER[i])) {
        // don't move a card off a foundation onto itself
        if (from.kind === "foundation" && from.index === i) continue;
        return { kind: "foundation", index: i };
      }
    }
  }

  // Then tableau columns.
  for (let i = 0; i < 7; i++) {
    if (from.kind === "tableau" && from.index === i) continue;
    const col = state.tableau[i];
    if (canStackOnTableau(head, col[col.length - 1])) {
      return { kind: "tableau", index: i };
    }
  }

  return null;
}

export function isWon(state: SolitaireState): boolean {
  return state.foundations.every((p) => p.length === 13);
}
