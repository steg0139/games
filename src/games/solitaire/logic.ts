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
 * Draw up to `count` cards from the stock to the waste (fewer if the stock is
 * nearly empty). Defaults to DRAW_COUNT (3). If the stock is empty, recycle
 * the waste back into it. Only the top waste card is ever playable.
 */
export function drawFromStock(
  state: SolitaireState,
  count: number = DRAW_COUNT,
): SolitaireState {
  if (state.stock.length === 0) {
    if (state.waste.length === 0) return state;
    // recycle: waste back to stock, face down, order reset
    const stock = [...state.waste].reverse().map((c) => ({ ...c, faceUp: false }));
    return { ...state, stock, waste: [] };
  }

  const stock = state.stock.slice();
  const drawn: Card[] = [];
  for (let i = 0; i < count && stock.length > 0; i++) {
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

/**
 * True when a win is guaranteed and can be auto-completed: the stock and waste
 * are empty and every tableau card is face up. In that state all remaining
 * cards are visible and freely movable, so they can always be sent to the
 * foundations in order.
 */
export function canAutoFinish(state: SolitaireState): boolean {
  if (isWon(state)) return false; // already done
  if (state.stock.length > 0 || state.waste.length > 0) return false;
  return state.tableau.every((col) => col.every((c) => c.faceUp));
}

/**
 * Find the next single top-of-pile card that can move to a foundation, for
 * auto-finish stepping. Checks tableau tops (and waste, for completeness).
 * Returns the source pile + card index, or null if none is currently playable.
 */
export function nextFoundationMove(
  state: SolitaireState,
): { from: PileId; cardIndex: number; to: PileId } | null {
  const tryCard = (
    card: Card | undefined,
    from: PileId,
    cardIndex: number,
  ): { from: PileId; cardIndex: number; to: PileId } | null => {
    if (!card) return null;
    for (let i = 0; i < 4; i++) {
      if (canStackOnFoundation(card, state.foundations[i], SUIT_ORDER[i])) {
        return { from, cardIndex, to: { kind: "foundation", index: i } };
      }
    }
    return null;
  };

  // Waste top first.
  const wasteMove = tryCard(
    state.waste[state.waste.length - 1],
    { kind: "waste" },
    state.waste.length - 1,
  );
  if (wasteMove) return wasteMove;

  // Then each tableau column top.
  for (let i = 0; i < 7; i++) {
    const col = state.tableau[i];
    const move = tryCard(
      col[col.length - 1],
      { kind: "tableau", index: i },
      col.length - 1,
    );
    if (move) return move;
  }

  return null;
}

/** Can `card` legally land on any foundation? */
function cardFitsAnyFoundation(card: Card, state: SolitaireState): boolean {
  for (let i = 0; i < 4; i++) {
    if (canStackOnFoundation(card, state.foundations[i], SUIT_ORDER[i])) {
      return true;
    }
  }
  return false;
}

/**
 * Can `card` legally land on any tableau column? `fromColumn` (if given) is
 * excluded so "moving within the same column" doesn't count as a move.
 */
function cardFitsAnyTableau(
  card: Card,
  state: SolitaireState,
  fromColumn?: number,
): boolean {
  for (let i = 0; i < 7; i++) {
    if (i === fromColumn) continue;
    const col = state.tableau[i];
    if (canStackOnTableau(card, col[col.length - 1])) return true;
  }
  return false;
}

/**
 * Is moving the face-up run starting at row `r` of column `c` onto some other
 * column a *productive* move? A move counts as productive only if it makes real
 * progress:
 *   - it uncovers a face-down card in the source column, or
 *   - it empties the source column onto a NON-empty column (freeing a slot).
 * A pure lateral shuffle (relocating a run with nothing to reveal, or moving a
 * whole column onto another empty column) is NOT productive.
 * Returns the destination column index if productive, else -1.
 */
function productiveTableauTarget(
  state: SolitaireState,
  c: number,
  r: number,
  run: Card[],
): number {
  const col = state.tableau[c];
  const head = run[0];
  const uncoversFaceDown = r > 0 && !col[r - 1].faceUp;
  const emptiesColumn = r === 0;

  for (let t = 0; t < 7; t++) {
    if (t === c) continue;
    const tcol = state.tableau[t];
    if (!canStackOnTableau(head, tcol[tcol.length - 1])) continue;

    if (uncoversFaceDown) return t; // reveals a hidden card — always useful
    if (emptiesColumn && tcol.length > 0) return t; // frees an empty column
    // else: lateral shuffle (no reveal, or moving onto another empty) — skip.
  }
  return -1;
}

/** True if any *productive* tableau move exists (foundation play or useful shift). */
function hasTableauMove(state: SolitaireState): boolean {
  for (let c = 0; c < 7; c++) {
    const col = state.tableau[c];
    for (let r = 0; r < col.length; r++) {
      if (!col[r].faceUp) continue;
      const run = faceUpRunFrom(col, r);
      if (!run) continue;

      // A single card to a foundation is always genuine progress.
      if (run.length === 1 && cardFitsAnyFoundation(run[0], state)) return true;

      // A productive tableau→tableau move.
      if (productiveTableauTarget(state, c, r, run) !== -1) return true;
    }
  }
  return false;
}

/**
 * True if a move can be made RIGHT NOW (no drawing): a productive tableau move,
 * or the current waste top playing to a foundation or tableau. This is the
 * "immediate move" signal; the dead-end decision also considers stock cycling
 * separately via runtime tracking in the screen.
 */
export function hasImmediateMove(state: SolitaireState): boolean {
  if (hasTableauMove(state)) return true;
  const top = state.waste[state.waste.length - 1];
  if (top) {
    if (cardFitsAnyFoundation(top, state)) return true;
    if (cardFitsAnyTableau(top, state)) return true;
  }
  return false;
}

/**
 * True when the game is lost. There is no move right now, and either:
 *   - the stock and waste are empty (nothing left to draw), or
 *   - the player has cycled a full pass through the stock without any progress
 *     (`stockCycledWithoutProgress`, tracked at runtime by the screen). Because
 *     stock cycling is deterministic, a full no-progress pass proves further
 *     cycling is futile — this makes detection correct in draw-three without a
 *     risky static solver, and it can never fire on a winnable position.
 */
export function isDeadEnd(
  state: SolitaireState,
  stockCycledWithoutProgress: boolean,
): boolean {
  if (isWon(state)) return false;
  if (hasImmediateMove(state)) return false;
  const stockLeft = state.stock.length + state.waste.length;
  if (stockLeft === 0) return true; // nothing to draw and no move
  return stockCycledWithoutProgress;
}

/**
 * A suggested next action. `move` highlights a concrete source (and, for a
 * playable card, its destination). `draw` suggests tapping the stock because a
 * playable card is reachable only after drawing. `none` means no move exists.
 */
export type Hint =
  | { kind: "move"; from: PileId; cardIndex: number; to: PileId }
  | { kind: "draw" }
  | { kind: "none" };

/** Score a move so the hint prefers the most useful one. Higher = better. */
function scoreMove(
  state: SolitaireState,
  from: PileId,
  cardIndex: number,
  to: PileId,
): number {
  let score = 0;
  if (to.kind === "foundation") score += 100; // advancing a foundation is best
  if (from.kind === "tableau") {
    const col = state.tableau[from.index];
    // Uncovering a face-down card is the most valuable tableau play.
    if (cardIndex > 0 && !col[cardIndex - 1].faceUp) score += 60;
    // Emptying a column (freeing a King slot) is useful too.
    else if (cardIndex === 0) score += 30;
  }
  if (from.kind === "waste") score += 10; // clearing the waste is mildly useful
  return score;
}

/**
 * Suggest a next action: the best available on-board move, else a draw if a
 * playable card is reachable by cycling the stock, else none (dead end).
 */
export function findHint(state: SolitaireState): Hint {
  let best: { from: PileId; cardIndex: number; to: PileId; score: number } | null =
    null;

  const consider = (from: PileId, cardIndex: number, to: PileId) => {
    const score = scoreMove(state, from, cardIndex, to);
    if (!best || score > best.score) best = { from, cardIndex, to, score };
  };

  // Tableau sources: valid face-up runs.
  for (let c = 0; c < 7; c++) {
    const col = state.tableau[c];
    for (let r = 0; r < col.length; r++) {
      if (!col[r].faceUp) continue;
      const run = faceUpRunFrom(col, r);
      if (!run) continue;
      const head = run[0];

      // Foundation play (single card).
      if (run.length === 1) {
        for (let f = 0; f < 4; f++) {
          if (canStackOnFoundation(head, state.foundations[f], SUIT_ORDER[f])) {
            consider({ kind: "tableau", index: c }, r, {
              kind: "foundation",
              index: f,
            });
          }
        }
      }

      // Only suggest a *productive* tableau→tableau move (reveals a card or
      // frees a column) — never a pointless lateral shuffle.
      const target = productiveTableauTarget(state, c, r, run);
      if (target !== -1) {
        consider({ kind: "tableau", index: c }, r, {
          kind: "tableau",
          index: target,
        });
      }
    }
  }

  // Waste top.
  if (state.waste.length > 0) {
    const top = state.waste[state.waste.length - 1];
    const idx = state.waste.length - 1;
    for (let f = 0; f < 4; f++) {
      if (canStackOnFoundation(top, state.foundations[f], SUIT_ORDER[f])) {
        consider({ kind: "waste" }, idx, { kind: "foundation", index: f });
      }
    }
    for (let t = 0; t < 7; t++) {
      const tcol = state.tableau[t];
      if (canStackOnTableau(top, tcol[tcol.length - 1])) {
        consider({ kind: "waste" }, idx, { kind: "tableau", index: t });
      }
    }
  }

  if (best) {
    const b = best as {
      from: PileId;
      cardIndex: number;
      to: PileId;
      score: number;
    };
    return { kind: "move", from: b.from, cardIndex: b.cardIndex, to: b.to };
  }

  // No on-board move. Can drawing surface something playable?
  for (const card of [...state.stock, ...state.waste]) {
    if (cardFitsAnyFoundation(card, state) || cardFitsAnyTableau(card, state)) {
      return { kind: "draw" };
    }
  }

  return { kind: "none" };
}
