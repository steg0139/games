import {
  type SolitaireState,
  drawFromStock,
  hasAnyLegalMove,
  isDeadEnd,
  moveCard,
  newGame,
  nextFoundationMove,
} from "./logic";

// Independent brute-force: does any card reachable as a future waste top play
// onto the *current* board? This is the ground truth isDeadEnd must match.
function anyReachableTopPlayable(s: SolitaireState, drawCount: number): boolean {
  const total = s.stock.length + s.waste.length;
  let sim = s;
  const seen = new Set<string>();
  for (let i = 0; i < (total + 1) * 4; i++) {
    const n = drawFromStock(sim, drawCount);
    if (n === sim) break;
    sim = n;
    const top = sim.waste[sim.waste.length - 1];
    if (!top || seen.has(top.id)) continue;
    seen.add(top.id);
    const wi = sim.waste.length - 1;
    for (let t = 0; t < 7; t++)
      if (moveCard(sim, { kind: "waste" }, wi, { kind: "tableau", index: t })) return true;
    for (let f = 0; f < 4; f++)
      if (moveCard(sim, { kind: "waste" }, wi, { kind: "foundation", index: f })) return true;
  }
  return false;
}

// Regression guard for repeated dead-end false-positives: isDeadEnd must never
// fire while a real move or a reachable playable draw exists. Plays random
// games for both draw modes and cross-checks every dead-end verdict.
describe("isDeadEnd never fires prematurely (property)", () => {
  for (const drawCount of [1, 3]) {
    it(`draw-${drawCount}: verdict matches brute-force over 60 games`, () => {
      for (let g = 0; g < 60; g++) {
        let s = newGame();
        for (let step = 0; step < 100; step++) {
          if (isDeadEnd(s, drawCount)) {
            expect(hasAnyLegalMove(s)).toBe(false);
            expect(anyReachableTopPlayable(s, drawCount)).toBe(false);
            break;
          }
          const fm = nextFoundationMove(s);
          if (fm) {
            s = moveCard(s, fm.from, fm.cardIndex, fm.to) ?? s;
            continue;
          }
          const drawn = drawFromStock(s, drawCount);
          if (drawn === s) break; // nothing more to do in this simple walk
          s = drawn;
        }
      }
    });
  }
});
