import { describe, expect, it } from "vitest";
import { type Card, createDeck } from "../../lib/cards";
import {
  type SolitaireState,
  DRAW_COUNT,
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
  it("is NOT a dead end when a legal (even unproductive) move exists", () => {
    // Only move is a lateral shuffle 6h->7c (reveals nothing) — but it's legal,
    // so the game is not stuck. This is the regression we fixed.
    const s = emptyState();
    s.tableau[0] = [down("2", "clubs"), up("9", "spades"), up("6", "hearts")];
    s.tableau[1] = [up("7", "clubs")]; // 6h can go on 7c
    expect(hasAnyLegalMove(s)).toBe(true);
    expect(isDeadEnd(s)).toBe(false);
  });

  it("is a dead end when stock/waste empty and no legal move", () => {
    const s = emptyState();
    s.tableau[0] = [up("5", "spades")];
    s.tableau[1] = [up("3", "clubs")]; // nothing stacks, no foundation move
    expect(hasAnyLegalMove(s)).toBe(false);
    expect(isDeadEnd(s)).toBe(true);
  });

  it("is a dead end when no on-board move and no stock card can ever play", () => {
    // No move now; drawing only ever surfaces 4c / 6h, neither of which can
    // land on 5s or 3c (5s needs a red 4; 3c needs a red 2). Deterministic
    // cycling proves it's stuck — no runtime counter needed.
    const s = emptyState();
    s.stock = [down("4", "clubs"), down("6", "hearts")];
    s.waste = [up("9", "spades")];
    s.tableau[0] = [up("5", "spades")];
    s.tableau[1] = [up("3", "clubs")];
    expect(hasAnyLegalMove(s)).toBe(false);
    expect(isDeadEnd(s)).toBe(true);
  });

  it("is NOT a dead end when a drawn card surfaces as a playable waste top", () => {
    // draw-three pops from the end of the stock, so a single draw of these
    // three lands 4h on top of the waste; 4h (red) stacks on 5s (black). This
    // is the false-positive case: no on-board move, but a draw creates one.
    const s = emptyState();
    // stock end is the first card drawn's *bottom*; after one draw of 3 the
    // waste top is the last-popped card = stock[0]. Put 4h there.
    s.stock = [down("4", "hearts"), down("8", "clubs"), down("2", "clubs")];
    s.waste = [];
    s.tableau[0] = [up("5", "spades")]; // 4h can stack here
    s.tableau[1] = [up("K", "clubs")];
    expect(hasAnyLegalMove(s)).toBe(false); // nothing plays yet
    expect(isDeadEnd(s)).toBe(false); // a draw makes 4h the top -> not stuck
  });

  it("is NOT a dead end when a drawn card can reach a foundation", () => {
    // Spades foundation at Ace; 2s surfaces as the waste top after a draw and
    // can advance the foundation.
    const s = emptyState();
    s.foundations[0] = [up("A", "spades")]; // SUIT_ORDER[0] === spades
    s.stock = [down("2", "spades"), down("9", "clubs"), down("7", "hearts")];
    s.tableau[0] = [up("5", "spades")];
    s.tableau[1] = [up("8", "clubs")];
    expect(hasAnyLegalMove(s)).toBe(false);
    expect(isDeadEnd(s)).toBe(false); // drawing surfaces 2s -> foundation
  });

  it("a lone King between empty columns is not a real move", () => {
    const s = emptyState();
    s.tableau[0] = [up("K", "spades")];
    // columns 1..6 empty; moving K to another empty column is a no-op
    expect(hasAnyLegalMove(s)).toBe(false);
    expect(isDeadEnd(s)).toBe(true);
  });

  it("respects the draw count: a card buried in the waste is reachable on draw-one", () => {
    // Ace of spades sits under the current waste top (2c). On DRAW-ONE every
    // card surfaces as a top, so the Ace is reachable to the (empty) spades
    // foundation — not a dead end. The detector must simulate the player's
    // actual draw count, not assume draw-three. (Regression: it hardcoded
    // draw-three and popped the banner right after a legal draw-one play.)
    const s = emptyState();
    s.foundations[0] = []; // spades foundation empty -> Ace is playable
    s.stock = [down("7", "clubs")];
    s.waste = [up("A", "spades"), up("2", "clubs")]; // top 2c, Ah buried
    s.tableau[0] = [up("5", "spades")];
    s.tableau[1] = [up("9", "diamonds")];
    expect(hasAnyLegalMove(s)).toBe(false);
    expect(isDeadEnd(s, 1)).toBe(false); // draw-one surfaces the Ace
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
