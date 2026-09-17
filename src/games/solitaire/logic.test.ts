import { describe, expect, it } from "vitest";
import { type Card, RANKS, createDeck } from "../../lib/cards";
import {
  type SolitaireState,
  DRAW_COUNT,
  SUIT_ORDER,
  canAutoFinish,
  drawFromStock,
  findHint,
  hasAnyLegalMove,
  isDeadEnd,
  isWon,
  moveCard,
  newGame,
  nextFoundationMove,
} from "./logic";

const deck = createDeck(true);
const up = (rank: string, suit: string): Card => ({
  ...deck.find((c) => c.rank === rank && c.suit === suit)!,
  faceUp: true,
});
const down = (rank: string, suit: string): Card => ({ ...up(rank, suit), faceUp: false });

function emptyState(): SolitaireState {
  return {
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
  };
}

describe("newGame", () => {
  it("deals 28 tableau cards across 7 columns with only the last face up", () => {
    const s = newGame();
    let total = 0;
    s.tableau.forEach((col, i) => {
      expect(col.length).toBe(i + 1);
      total += col.length;
      col.forEach((c, r) => expect(c.faceUp).toBe(r === col.length - 1));
    });
    expect(total).toBe(28);
    expect(s.stock.length).toBe(24); // 52 - 28
    expect(s.stock.every((c) => !c.faceUp)).toBe(true);
  });
});

describe("drawFromStock", () => {
  it("draws DRAW_COUNT cards to the waste, face up", () => {
    const s = emptyState();
    s.stock = [up("2", "clubs"), up("3", "clubs"), up("4", "clubs"), up("5", "clubs")].map(
      (c) => ({ ...c, faceUp: false }),
    );
    const next = drawFromStock(s, DRAW_COUNT);
    expect(next.waste.length).toBe(3);
    expect(next.stock.length).toBe(1);
    expect(next.waste.every((c) => c.faceUp)).toBe(true);
  });

  it("recycles the waste back to stock when the stock is empty", () => {
    const s = emptyState();
    s.waste = [up("2", "clubs"), up("3", "clubs")];
    const next = drawFromStock(s, 3);
    expect(next.stock.length).toBe(2);
    expect(next.waste.length).toBe(0);
    expect(next.stock.every((c) => !c.faceUp)).toBe(true);
  });

  it("is a no-op when stock and waste are both empty", () => {
    const s = emptyState();
    expect(drawFromStock(s, 3)).toBe(s);
  });

  it("draws one card in draw-one mode", () => {
    const s = emptyState();
    s.stock = [up("2", "clubs"), up("3", "clubs")].map((c) => ({ ...c, faceUp: false }));
    const next = drawFromStock(s, 1);
    expect(next.waste.length).toBe(1);
  });
});

describe("moveCard", () => {
  it("moves an Ace from waste to an empty foundation", () => {
    const s = emptyState();
    s.waste = [up("A", "spades")];
    const next = moveCard(s, { kind: "waste" }, 0, { kind: "foundation", index: 0 });
    expect(next).not.toBeNull();
    expect(next!.foundations[0]).toHaveLength(1);
    expect(next!.waste).toHaveLength(0);
  });

  it("rejects a non-Ace onto an empty foundation", () => {
    const s = emptyState();
    s.waste = [up("2", "spades")];
    expect(moveCard(s, { kind: "waste" }, 0, { kind: "foundation", index: 0 })).toBeNull();
  });

  it("allows alternating-color descending tableau stacking", () => {
    const s = emptyState();
    s.tableau[0] = [up("7", "spades")]; // black 7
    s.tableau[1] = [up("6", "hearts")]; // red 6 -> onto black 7 is valid
    const next = moveCard(s, { kind: "tableau", index: 1 }, 0, { kind: "tableau", index: 0 });
    expect(next).not.toBeNull();
    expect(next!.tableau[0].map((c) => c.rank)).toEqual(["7", "6"]);
  });

  it("rejects same-color tableau stacking", () => {
    const s = emptyState();
    s.tableau[0] = [up("7", "spades")]; // black
    s.tableau[1] = [up("6", "clubs")]; // black 6 -> invalid
    expect(
      moveCard(s, { kind: "tableau", index: 1 }, 0, { kind: "tableau", index: 0 }),
    ).toBeNull();
  });

  it("only allows Kings onto empty tableau columns", () => {
    const s = emptyState();
    s.tableau[0] = [up("K", "spades")];
    s.tableau[1] = [up("Q", "hearts")];
    expect(
      moveCard(s, { kind: "tableau", index: 0 }, 0, { kind: "tableau", index: 2 }),
    ).not.toBeNull();
    expect(
      moveCard(s, { kind: "tableau", index: 1 }, 0, { kind: "tableau", index: 3 }),
    ).toBeNull();
  });

  it("moves a valid multi-card run together and reveals the card beneath", () => {
    const s = emptyState();
    s.tableau[0] = [down("9", "hearts"), up("6", "spades"), up("5", "hearts")]; // run 6s-5h
    s.tableau[1] = [up("7", "hearts")]; // 6s onto 7h valid
    const next = moveCard(s, { kind: "tableau", index: 0 }, 1, { kind: "tableau", index: 1 });
    expect(next).not.toBeNull();
    expect(next!.tableau[1].map((c) => c.rank)).toEqual(["7", "6", "5"]);
    // Card beneath the run is revealed.
    expect(next!.tableau[0]).toHaveLength(1);
    expect(next!.tableau[0][0].faceUp).toBe(true);
  });
});

describe("win + auto-finish", () => {
  it("isWon only when all four foundations hold 13", () => {
    const s = emptyState();
    s.foundations = [[], [], [], []];
    expect(isWon(s)).toBe(false);
  });

  it("canAutoFinish when stock/waste empty and all tableau face up", () => {
    const s = emptyState();
    s.tableau[0] = [up("2", "spades")];
    expect(canAutoFinish(s)).toBe(true);
  });

  it("cannot auto-finish with cards still in the stock", () => {
    const s = emptyState();
    s.stock = [down("2", "spades")];
    s.tableau[0] = [up("3", "spades")];
    expect(canAutoFinish(s)).toBe(false);
  });

  it("nextFoundationMove finds a playable ace/next card", () => {
    const s = emptyState();
    s.tableau[0] = [up("A", "spades")];
    const move = nextFoundationMove(s);
    expect(move).not.toBeNull();
    expect(move!.to.kind).toBe("foundation");
  });
});

describe("dead-end detection", () => {
  // Dead-end detection is deliberately conservative: it only fires when it is
  // impossible to be wrong — no legal move AND nothing left to draw. A false
  // "you're stuck" banner is worse than a missed one, and precisely proving a
  // stuck position while stock remains is a full Klondike reachability problem.

  it("is a dead end when stock/waste are empty and no legal move exists", () => {
    const s = emptyState();
    s.tableau[0] = [up("5", "spades")];
    s.tableau[1] = [up("3", "clubs")]; // nothing stacks, no foundation move
    expect(hasAnyLegalMove(s)).toBe(false);
    expect(isDeadEnd(s)).toBe(true);
  });

  it("is NOT a dead end when a legal (even unproductive) move exists", () => {
    // Lateral shuffle 6h->7c is legal, so not stuck even with empty stock.
    const s = emptyState();
    s.tableau[0] = [down("2", "clubs"), up("9", "spades"), up("6", "hearts")];
    s.tableau[1] = [up("7", "clubs")];
    expect(hasAnyLegalMove(s)).toBe(true);
    expect(isDeadEnd(s)).toBe(false);
  });

  it("is NEVER a dead end while the stock still has cards", () => {
    // No on-board move, but the stock is non-empty. We refuse to call this
    // stuck: drawing might change the board, and proving otherwise precisely is
    // intractable, so the conservative rule keeps the player's draw available.
    const s = emptyState();
    s.stock = [down("4", "clubs"), down("6", "hearts")];
    s.tableau[0] = [up("5", "spades")];
    s.tableau[1] = [up("3", "clubs")];
    expect(hasAnyLegalMove(s)).toBe(false);
    expect(isDeadEnd(s)).toBe(false);
  });

  it("is NEVER a dead end while the waste still has cards", () => {
    // Even a single buried waste card keeps the position alive under the
    // conservative rule (recycling could re-surface it).
    const s = emptyState();
    s.waste = [up("A", "spades"), up("2", "clubs")]; // top 2c can't play
    s.tableau[0] = [up("5", "spades")];
    s.tableau[1] = [up("9", "diamonds")];
    expect(hasAnyLegalMove(s)).toBe(false);
    expect(isDeadEnd(s)).toBe(false);
  });

  it("a lone King between empty columns is stuck when nothing is left to draw", () => {
    const s = emptyState();
    s.tableau[0] = [up("K", "spades")];
    // columns 1..6 empty; moving K to another empty column is a no-op, and the
    // stock/waste are empty -> genuinely stuck.
    expect(hasAnyLegalMove(s)).toBe(false);
    expect(isDeadEnd(s)).toBe(true);
  });

  it("is not a dead end when the board is complete (won)", () => {
    const s = emptyState();
    s.foundations = SUIT_ORDER.map((suit) =>
      RANKS.map((rank) => up(rank, suit)),
    );
    expect(isWon(s)).toBe(true);
    expect(isDeadEnd(s)).toBe(false);
  });
});

describe("findHint", () => {
  it("suggests a reveal move but not a pointless shuffle", () => {
    const s = emptyState();
    s.tableau[0] = [down("2", "clubs"), up("6", "hearts")]; // moving 6h reveals 2c
    s.tableau[1] = [up("7", "clubs")];
    const hint = findHint(s);
    expect(hint.kind).toBe("move");
  });

  it("returns none when the only move is an unproductive shuffle", () => {
    const s = emptyState();
    s.tableau[0] = [down("2", "clubs"), up("9", "spades"), up("6", "hearts")];
    s.tableau[1] = [up("7", "clubs")];
    // 6h->7c reveals nothing (9s is above 2c and stays); not productive.
    expect(findHint(s).kind).toBe("none");
  });
});
