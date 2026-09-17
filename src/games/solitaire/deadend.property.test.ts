import { describe, expect, it } from "vitest";
import {
  type SolitaireState,
  drawFromStock,
  findHint,
  hasAnyLegalMove,
  isDeadEnd,
  moveCard,
  newGame,
} from "./logic";

// Regression guard against the repeated dead-end FALSE POSITIVES: the banner
// must never appear while the game can still change. Under the conservative
// rule that means isDeadEnd may only be true when BOTH:
//   - no legal move exists on the board, and
//   - the stock and waste are empty (nothing left to draw).
// We play many random games (both draw modes) and assert that invariant holds
// at every single step.
describe("isDeadEnd conservative invariant (never a false positive)", () => {
  for (const drawCount of [1, 3]) {
    it(`draw-${drawCount}: only fires with no move AND empty stock+waste`, () => {
      for (let g = 0; g < 150; g++) {
        let s: SolitaireState = newGame();
        for (let step = 0; step < 250; step++) {
          if (isDeadEnd(s)) {
            // The two conditions that make a dead end impossible to be wrong.
            expect(hasAnyLegalMove(s)).toBe(false);
            expect(s.stock.length).toBe(0);
            expect(s.waste.length).toBe(0);
            break;
          }
          const h = findHint(s);
          if (h.kind === "move") {
            s = moveCard(s, h.from, h.cardIndex, h.to) ?? s;
            continue;
          }
          const drawn = drawFromStock(s, drawCount);
          if (drawn === s) break; // nothing to draw; end this walk
          s = drawn;
        }
      }
    });
  }
});
