import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGroup } from "framer-motion";
import PlayingCard from "../../components/PlayingCard";
import { type Card, cardColor, rankValue, suitSymbol } from "../../lib/cards";
import { recordSolitaireResult, useProfile } from "../../lib/stats/useProfile";
import {
  type PileId,
  type SolitaireState,
  SUIT_ORDER,
  autoMoveTarget,
  canAutoFinish,
  drawFromStock,
  findHint,
  isDeadEnd,
  isWon,
  moveCard,
  newGame,
  nextFoundationMove,
} from "./logic";
import { type HistoryEntry, clearGame, loadGame, saveGame } from "./persistence";
import "./Solitaire.css";

interface Selection {
  from: PileId;
  cardIndex: number;
}

// Live drag being rendered (the floating card stack following the pointer).
interface DragState {
  cards: Card[]; // the run being dragged
  x: number; // current top-left of the drag layer (viewport coords)
  y: number;
}

// Internal bookkeeping for a pointer-drag gesture in progress.
interface DragSession {
  from: PileId;
  cardIndex: number;
  cards: Card[];
  pointerId: number;
  startX: number;
  startY: number;
  grabOffsetX: number; // pointer offset within the grabbed card
  grabOffsetY: number;
  active: boolean; // passed the movement threshold
  moved: boolean; // whether a real drag happened (suppresses the click)
}

const DRAG_THRESHOLD = 8; // px before a press becomes a drag

function samePile(a: PileId, b: PileId): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "waste" && b.kind === "waste") return true;
  return (a as { index: number }).index === (b as { index: number }).index;
}

export default function SolitaireScreen() {
  // Resume an in-progress game if one was saved (read once on mount).
  const resumed = useRef(loadGame());

  const [state, setState] = useState<SolitaireState>(
    () => resumed.current?.state ?? newGame(),
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const [moves, setMoves] = useState(resumed.current?.moves ?? 0);
  // Bumped on every new game so the deal-in animation replays. A resumed game
  // should not replay the deal, so start at a non-zero id in that case.
  const [dealId, setDealId] = useState(resumed.current ? 1 : 0);
  const startedAt = useRef<number>(resumed.current?.startedAt ?? Date.now());
  const recordedResult = useRef(false);
  // A resumed game shouldn't replay the deal-in animation; only fresh deals do.
  const [freshDeal, setFreshDeal] = useState(!resumed.current);

  // Undo history: snapshots of {state, moves} before each move/draw.
  const [history, setHistory] = useState<HistoryEntry[]>(
    resumed.current?.history ?? [],
  );

  // Hint: card ids to briefly highlight, and whether to pulse the stock.
  const [hintCardIds, setHintCardIds] = useState<Set<string>>(new Set());
  const [hintStock, setHintStock] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag: refs to drop-zone piles for hit-testing, and the live drag session.
  const foundationEls = useRef<(HTMLDivElement | null)[]>([]);
  const columnEls = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  // Set true when a drag just ended, so the trailing click is ignored.
  const justDragged = useRef(false);

  const [autoFinishing, setAutoFinishing] = useState(false);
  // Lets the player dismiss the "no moves" banner and keep trying the deal,
  // in case the detection is wrong or they just want to poke at it.
  const [dismissedDeadEnd, setDismissedDeadEnd] = useState(false);

  const profile = useProfile();
  const drawCount = profile.settings.solitaireDrawCount;
  const autoFinishEnabled = profile.settings.solitaireAutoFinish;

  const won = useMemo(() => isWon(state), [state]);
  // Detected dead end (not while auto-finishing). This does NOT count as a
  // loss on its own — the banner is dismissible; a loss is only recorded if
  // the player starts a new game from an unfinished dead-end board.
  const deadEnd = useMemo(
    () => !autoFinishing && isDeadEnd(state),
    [state, autoFinishing],
  );
  const showLossBanner = deadEnd && !dismissedDeadEnd;

  // Keep the latest game snapshot in a ref so `reset` can decide whether to
  // record a loss without depending on (and being recreated by) render state.
  const snapshot = useRef({ deadEnd, won, moves });
  snapshot.current = { deadEnd, won, moves };
  const finishable = useMemo(() => canAutoFinish(state), [state]);
  // With auto-finish enabled, it runs on its own — no button. With it off,
  // offer the manual button when the board is finishable.
  const showAutoFinish = finishable && !autoFinishing && !autoFinishEnabled;

  // Auto-trigger the finish when the setting is on and the board is winnable.
  useEffect(() => {
    if (autoFinishEnabled && finishable && !autoFinishing) {
      setSelection(null);
      setAutoFinishing(true);
    }
  }, [autoFinishEnabled, finishable, autoFinishing]);

  const reset = useCallback(() => {
    // Count the game just played as a loss if it wasn't won and was actually
    // started (at least one move, or a detected dead end). Abandoning a game
    // you've begun — via "New" or the dead-end banner — is a loss; re-dealing
    // a fresh board before making any move is not. Guard against
    // double-recording. Read from the ref so this callback stays stable and
    // never sees stale values.
    const { deadEnd: wasDeadEnd, won: hadWon, moves: playedMoves } =
      snapshot.current;
    const startedAndUnfinished = !hadWon && (playedMoves > 0 || wasDeadEnd);
    if (startedAndUnfinished && !recordedResult.current) {
      recordedResult.current = true;
      recordSolitaireResult({
        won: false,
        moves: playedMoves,
        timeSeconds: Math.round((Date.now() - startedAt.current) / 1000),
      });
    }
    // Starting a new game discards any resumable save.
    clearGame();
    setState(newGame());
    setSelection(null);
    setMoves(0);
    setDealId((n) => n + 1);
    setAutoFinishing(false);
    setDismissedDeadEnd(false);
    setFreshDeal(true);
    setHistory([]);
    setHintCardIds(new Set());
    setHintStock(false);
    startedAt.current = Date.now();
    recordedResult.current = false;
  }, []);

  // Auto-finish: once started, step the next card to a foundation on an
  // interval so the cards visibly fly home. Stops when there are no more
  // foundation moves (i.e. the board is won).
  useEffect(() => {
    if (!autoFinishing) return;
    const timer = setInterval(() => {
      setState((s) => {
        const move = nextFoundationMove(s);
        if (!move) {
          setAutoFinishing(false);
          return s;
        }
        const next = moveCard(s, move.from, move.cardIndex, move.to);
        if (!next) {
          setAutoFinishing(false);
          return s;
        }
        setMoves((m) => m + 1);
        return next;
      });
    }, AUTO_FINISH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoFinishing]);

  // Changing the draw mode can't apply mid-game, so start a fresh deal.
  const prevDrawCount = useRef(drawCount);
  useEffect(() => {
    if (prevDrawCount.current !== drawCount) {
      prevDrawCount.current = drawCount;
      reset();
    }
  }, [drawCount, reset]);

  // Record a win exactly once when the board is completed. (A loss is recorded
  // on new game from a dead-end board — see reset — so a dismissible banner
  // never prematurely counts a loss.)
  useEffect(() => {
    if (won && !recordedResult.current) {
      recordedResult.current = true;
      recordSolitaireResult({
        won: true,
        moves,
        timeSeconds: Math.round((Date.now() - startedAt.current) / 1000),
      });
    }
  }, [won, moves]);

  // Persist the in-progress game so leaving the screen (or closing the PWA)
  // and returning resumes it. Clear the save once the game ends (win or dead
  // end); a fresh "New" game clears via reset().
  useEffect(() => {
    if (won || deadEnd) {
      clearGame();
    } else {
      saveGame({ state, moves, startedAt: startedAt.current, drawCount, history });
    }
  }, [state, moves, won, deadEnd, drawCount, history]);

  const applyMove = useCallback(
    (from: PileId, cardIndex: number, to: PileId) => {
      const next = moveCard(state, from, cardIndex, to);
      if (next) {
        // Snapshot the pre-move state for undo.
        setHistory((h) => [...h, { state, moves }]);
        setState(next);
        setMoves((m) => m + 1);
        // A successful move changes the board; re-arm the dead-end banner so
        // it can reappear if the player gets stuck again.
        setDismissedDeadEnd(false);
      }
      setSelection(null);
    },
    [state, moves],
  );

  const handleStock = useCallback(() => {
    if (autoFinishing) return;
    const next = drawFromStock(state, drawCount);
    if (next === state) return; // no-op (empty stock and waste)
    // Snapshot before drawing so the draw (and recycle) is undoable.
    setHistory((h) => [...h, { state, moves }]);
    setState(next);
    setSelection(null);
  }, [state, moves, drawCount, autoFinishing]);

  const undo = useCallback(() => {
    if (autoFinishing) return;
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setState(prev.state);
      setMoves(prev.moves);
      setSelection(null);
      // Undoing out of a dead end means it's no longer stuck.
      setDismissedDeadEnd(false);
      return h.slice(0, -1);
    });
  }, [autoFinishing]);

  // Resolve the card id at a pile position (for highlighting a hinted card).
  const cardIdAt = useCallback(
    (pile: PileId, cardIndex: number): string | null => {
      if (pile.kind === "waste") return state.waste[cardIndex]?.id ?? null;
      if (pile.kind === "foundation")
        return state.foundations[pile.index][cardIndex]?.id ?? null;
      return state.tableau[pile.index][cardIndex]?.id ?? null;
    },
    [state],
  );

  const showHint = useCallback(() => {
    if (autoFinishing) return;
    const hint = findHint(state);

    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHintCardIds(new Set());
    setHintStock(false);

    if (hint.kind === "move") {
      const ids = new Set<string>();
      const srcId = cardIdAt(hint.from, hint.cardIndex);
      if (srcId) ids.add(srcId);
      // Highlight the destination's current top card too, if any.
      if (hint.to.kind === "tableau") {
        const col = state.tableau[hint.to.index];
        if (col.length > 0) ids.add(col[col.length - 1].id);
      } else if (hint.to.kind === "foundation") {
        const f = state.foundations[hint.to.index];
        if (f.length > 0) ids.add(f[f.length - 1].id);
      }
      setHintCardIds(ids);
    } else if (hint.kind === "draw") {
      setHintStock(true);
    }
    // hint.kind === "none": nothing to show (dead end / no move).

    hintTimer.current = setTimeout(() => {
      setHintCardIds(new Set());
      setHintStock(false);
    }, 1600);
  }, [autoFinishing, state, cardIdAt]);

  // Tap logic: if nothing selected, try auto-move; if that fails, select.
  // If something selected, treat the new tap as a destination.
  const tapCard = useCallback(
    (from: PileId, cardIndex: number) => {
      if (autoFinishing) return;
      if (selection) {
        // Tapping the same pile again clears selection.
        if (samePile(selection.from, from) && selection.cardIndex === cardIndex) {
          setSelection(null);
          return;
        }
        applyMove(selection.from, selection.cardIndex, from);
        return;
      }

      const auto = autoMoveTarget(state, from, cardIndex);
      if (auto) {
        applyMove(from, cardIndex, auto);
      } else {
        setSelection({ from, cardIndex });
      }
    },
    [selection, state, applyMove, autoFinishing],
  );

  // Tapping an empty pile as a destination.
  const tapEmptyPile = useCallback(
    (to: PileId) => {
      if (!selection) return;
      applyMove(selection.from, selection.cardIndex, to);
    },
    [selection, applyMove],
  );

  const isSelected = useCallback(
    (from: PileId, cardIndex: number) =>
      !!selection &&
      samePile(selection.from, from) &&
      selection.cardIndex === cardIndex,
    [selection],
  );

  // Clear selection on Escape (useful in dev/desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The face-up run of cards that would be dragged starting at a position.
  // For tableau: the contiguous valid descending run from cardIndex to the
  // bottom. For waste/foundation: just that single card.
  const draggableRun = useCallback(
    (from: PileId, cardIndex: number): Card[] | null => {
      if (from.kind === "waste") {
        const c = state.waste[cardIndex];
        return c ? [c] : null;
      }
      if (from.kind === "foundation") {
        const c = state.foundations[from.index][cardIndex];
        return c ? [c] : null;
      }
      const col = state.tableau[from.index];
      const run = col.slice(cardIndex);
      if (run.length === 0 || run.some((c) => !c.faceUp)) return null;
      for (let i = 0; i < run.length - 1; i++) {
        const a = run[i];
        const b = run[i + 1];
        const ok =
          cardColor(a.suit) !== cardColor(b.suit) &&
          RANK_ORDER(a) === RANK_ORDER(b) + 1;
        if (!ok) return null;
      }
      return run;
    },
    [state],
  );

  // Which pile (if any) is under the given viewport point.
  const pileAtPoint = useCallback((cx: number, cy: number): PileId | null => {
    const hit = (el: HTMLDivElement | null) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    };
    for (let i = 0; i < foundationEls.current.length; i++) {
      if (hit(foundationEls.current[i])) return { kind: "foundation", index: i };
    }
    for (let i = 0; i < columnEls.current.length; i++) {
      if (hit(columnEls.current[i])) return { kind: "tableau", index: i };
    }
    return null;
  }, []);

  const onCardPointerDown = useCallback(
    (from: PileId, cardIndex: number, e: React.PointerEvent) => {
      if (autoFinishing || won) return;
      justDragged.current = false; // fresh gesture
      const cards = draggableRun(from, cardIndex);
      if (!cards) return;
      dragRef.current = {
        from,
        cardIndex,
        cards,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        grabOffsetX: 0,
        grabOffsetY: 0,
        active: false,
        moved: false,
      };
    },
    [autoFinishing, won, draggableRun],
  );

  // Global pointer move/up while a drag session exists.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = dragRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (!s.active && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

      if (!s.active) {
        s.active = true;
        s.moved = true;
        setSelection(null); // a drag cancels any tap-selection
      }
      setDrag({
        cards: s.cards,
        x: e.clientX - CARD_GRAB_X,
        y: e.clientY - CARD_GRAB_Y,
      });
    };

    const onUp = (e: PointerEvent) => {
      const s = dragRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      if (s.active) {
        // Ignore the click that browsers fire right after this pointerup.
        justDragged.current = true;
        const target = pileAtPoint(e.clientX, e.clientY);
        if (target) applyMove(s.from, s.cardIndex, target);
      }
      dragRef.current = null;
      setDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [pileAtPoint, applyMove]);

  // Suppress the click that follows a real drag (so it doesn't tap-select).
  const guardedTap = useCallback(
    (from: PileId, cardIndex: number) => {
      if (justDragged.current) {
        justDragged.current = false;
        return;
      }
      tapCard(from, cardIndex);
    },
    [tapCard],
  );

  return (
    <div className="solitaire">
      <header className="app-bar">
        <Link to="/" className="icon-btn" aria-label="Back to menu">
          ←
        </Link>
        <h1>Solitaire</h1>
        <span className="status-line">{moves} moves</span>
        <button
          className="icon-btn"
          onClick={showHint}
          disabled={autoFinishing || won || deadEnd}
          aria-label="Show a hint"
        >
          Hint
        </button>
        <button
          className="icon-btn"
          onClick={undo}
          disabled={history.length === 0 || autoFinishing || won}
          aria-label="Undo last move"
        >
          Undo
        </button>
        {showAutoFinish && (
          <button
            className="btn-primary"
            onClick={() => {
              setSelection(null);
              setAutoFinishing(true);
            }}
          >
            Auto-finish
          </button>
        )}
        <button className="btn-primary" onClick={reset}>
          New
        </button>
      </header>

      <div className="felt">
        {won && (
          <div className="win-banner">
            <div className="win-card">
              <h2>You win! 🎉</h2>
              <p>Cleared in {moves} moves.</p>
              <button className="btn-primary" onClick={reset}>
                Play again
              </button>
            </div>
          </div>
        )}

        {showLossBanner && (
          <div className="deadend-banner" role="status">
            <div className="deadend-text">
              <strong>No moves left</strong>
              <span>This deal looks unwinnable.</span>
            </div>
            <div className="deadend-actions">
              <button
                className="icon-btn"
                onClick={() => setDismissedDeadEnd(true)}
              >
                Keep trying
              </button>
              <button className="btn-primary" onClick={reset}>
                New game
              </button>
            </div>
          </div>
        )}

        <LayoutGroup>
        <div className="top-row">
          <div className="stock-waste">
            <div
              className={`pile stock ${hintStock ? "hint-stock" : ""}`}
              onClick={handleStock}
              role="button"
              aria-label="Draw from stock"
            >
              {state.stock.length > 0 ? (
                <>
                  {/* Static pile: a plain card back that stays put. It does
                      not share a layoutId with the waste, so drawing doesn't
                      animate the whole stock away. */}
                  <PlayingCard
                    card={state.stock[state.stock.length - 1]}
                    layoutId={null}
                  />
                  <span className="pile-count" aria-hidden>
                    {state.stock.length}
                  </span>
                </>
              ) : (
                <div className="pile-placeholder recycle">↻</div>
              )}
            </div>

            <div className="pile waste">
              {state.waste.length > 0 ? (
                (() => {
                  // Fan up to `drawCount` waste cards; only the top is playable.
                  const fanCount = Math.min(
                    WASTE_FAN,
                    drawCount,
                    state.waste.length,
                  );
                  const startIndex = state.waste.length - fanCount;
                  return state.waste.slice(startIndex).map((card, i) => {
                    const cardIndex = startIndex + i;
                    const isTop = cardIndex === state.waste.length - 1;
                    return (
                      <PlayingCard
                        key={card.id}
                        card={card}
                        animate
                        entrance
                        hinted={hintCardIds.has(card.id)}
                        className={`waste-card ${
                          drag?.cards.some((c) => c.id === card.id)
                            ? "dragging-src"
                            : ""
                        }`}
                        style={{ left: `${i * WASTE_FAN_OFFSET}px` }}
                        selected={
                          isTop && isSelected({ kind: "waste" }, cardIndex)
                        }
                        onPointerDown={
                          isTop
                            ? (e) =>
                                onCardPointerDown(
                                  { kind: "waste" },
                                  cardIndex,
                                  e,
                                )
                            : undefined
                        }
                        onClick={
                          isTop
                            ? () => guardedTap({ kind: "waste" }, cardIndex)
                            : undefined
                        }
                      />
                    );
                  });
                })()
              ) : (
                <div className="pile-placeholder" />
              )}
            </div>
          </div>

          <div className="foundations">
            {state.foundations.map((pile, i) => {
              const to: PileId = { kind: "foundation", index: i };
              return (
                <div
                  key={i}
                  ref={(el) => (foundationEls.current[i] = el)}
                  className="pile foundation"
                  onClick={() =>
                    pile.length === 0 ? tapEmptyPile(to) : undefined
                  }
                >
                  {pile.length > 0 ? (
                    <PlayingCard
                      card={pile[pile.length - 1]}
                      animate
                      hinted={hintCardIds.has(pile[pile.length - 1].id)}
                      selected={isSelected(to, pile.length - 1)}
                      onPointerDown={(e) =>
                        onCardPointerDown(to, pile.length - 1, e)
                      }
                      onClick={() => guardedTap(to, pile.length - 1)}
                    />
                  ) : (
                    <div className="pile-placeholder foundation-hint">
                      {suitSymbol(SUIT_ORDER[i])}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="tableau" key={dealId}>
          {state.tableau.map((column, colIndex) => {
            const to: PileId = { kind: "tableau", index: colIndex };
            return (
              <div
                key={colIndex}
                ref={(el) => (columnEls.current[colIndex] = el)}
                className="tableau-column"
                onClick={() =>
                  column.length === 0 ? tapEmptyPile(to) : undefined
                }
              >
                {column.length === 0 && (
                  <div className="pile-placeholder column-empty" />
                )}
                {column.map((card, cardIndex) => {
                  const dragging = drag?.cards.some((c) => c.id === card.id);
                  return (
                    <PlayingCard
                      key={card.id}
                      card={card}
                      animate
                      // Deal-in stagger only on a fresh board before any move
                      // (not on resume, and not after moves start).
                      entrance={freshDeal && moves === 0}
                      entranceDelay={
                        freshDeal && moves === 0
                          ? (colIndex + cardIndex) * DEAL_STAGGER
                          : 0
                      }
                      className={`stacked ${dragging ? "dragging-src" : ""}`}
                      style={{ top: `${offsetForIndex(column, cardIndex)}px` }}
                      hinted={hintCardIds.has(card.id)}
                      selected={isSelected(to, cardIndex)}
                      onPointerDown={
                        card.faceUp
                          ? (e) => onCardPointerDown(to, cardIndex, e)
                          : undefined
                      }
                      onClick={
                        card.faceUp ? () => guardedTap(to, cardIndex) : undefined
                      }
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
        </LayoutGroup>

        {drag && (
          <div
            className="drag-layer"
            style={{ transform: `translate(${drag.x}px, ${drag.y}px)` }}
          >
            {drag.cards.map((card, i) => (
              <PlayingCard
                key={card.id}
                card={card}
                className="drag-card"
                style={{ top: `${i * FACE_UP_OFFSET}px` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// How many waste cards to fan out, and the horizontal offset between them.
const WASTE_FAN = 3;
const WASTE_FAN_OFFSET = 14;

// Per-step delay (seconds) for the staggered deal-in. Kept small for a fast deal.
const DEAL_STAGGER = 0.025;

// Delay between auto-finish steps so cards visibly fly to the foundations.
const AUTO_FINISH_INTERVAL_MS = 160;

// Where the finger "grabs" the dragged card (roughly its upper-middle), so the
// floating stack sits naturally under the pointer.
const CARD_GRAB_X = 30;
const CARD_GRAB_Y = 24;

// Rank order with Ace low (A=1 ... K=13), for validating a draggable run.
function RANK_ORDER(card: Card): number {
  return rankValue(card.rank);
}

// Cumulative vertical offset for a stacked card: face-down cards sit tighter
// than face-up cards, so we sum the per-card offset of everything above it.
const FACE_DOWN_OFFSET = 14;
const FACE_UP_OFFSET = 26;

function offsetForIndex(column: { faceUp: boolean }[], index: number): number {
  let top = 0;
  for (let i = 0; i < index; i++) {
    top += column[i].faceUp ? FACE_UP_OFFSET : FACE_DOWN_OFFSET;
  }
  return top;
}
