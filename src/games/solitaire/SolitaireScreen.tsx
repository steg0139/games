import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGroup } from "framer-motion";
import PlayingCard from "../../components/PlayingCard";
import { suitSymbol } from "../../lib/cards";
import { recordSolitaireResult, useProfile } from "../../lib/stats/useProfile";
import {
  type PileId,
  type SolitaireState,
  SUIT_ORDER,
  autoMoveTarget,
  canAutoFinish,
  drawFromStock,
  isDeadEnd,
  isWon,
  moveCard,
  newGame,
  nextFoundationMove,
} from "./logic";
import { clearGame, loadGame, saveGame } from "./persistence";
import "./Solitaire.css";

interface Selection {
  from: PileId;
  cardIndex: number;
}

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
    // If we're abandoning an unfinished game that has no moves left, count it
    // as a loss now (we don't record on detection, since the banner is
    // dismissible and the player may keep trying). Read from the ref so this
    // callback stays stable and never sees stale values.
    const { deadEnd: wasDeadEnd, won: hadWon, moves: playedMoves } =
      snapshot.current;
    if (wasDeadEnd && !hadWon && !recordedResult.current) {
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
      saveGame({ state, moves, startedAt: startedAt.current, drawCount });
    }
  }, [state, moves, won, deadEnd, drawCount]);

  const applyMove = useCallback(
    (from: PileId, cardIndex: number, to: PileId) => {
      const next = moveCard(state, from, cardIndex, to);
      if (next) {
        setState(next);
        setMoves((m) => m + 1);
        // A successful move changes the board; re-arm the dead-end banner so
        // it can reappear if the player gets stuck again.
        setDismissedDeadEnd(false);
      }
      setSelection(null);
    },
    [state],
  );

  const handleStock = useCallback(() => {
    if (autoFinishing) return;
    setState((s) => drawFromStock(s, drawCount));
    setSelection(null);
  }, [drawCount, autoFinishing]);

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

  return (
    <div className="solitaire">
      <header className="app-bar">
        <Link to="/" className="icon-btn" aria-label="Back to menu">
          ←
        </Link>
        <h1>Solitaire</h1>
        <span className="status-line">{moves} moves</span>
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
              className="pile stock"
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
                        className="waste-card"
                        style={{ left: `${i * WASTE_FAN_OFFSET}px` }}
                        selected={
                          isTop && isSelected({ kind: "waste" }, cardIndex)
                        }
                        onClick={
                          isTop
                            ? () => tapCard({ kind: "waste" }, cardIndex)
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
                  className="pile foundation"
                  onClick={() =>
                    pile.length === 0 ? tapEmptyPile(to) : undefined
                  }
                >
                  {pile.length > 0 ? (
                    <PlayingCard
                      card={pile[pile.length - 1]}
                      animate
                      selected={isSelected(to, pile.length - 1)}
                      onClick={() => tapCard(to, pile.length - 1)}
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
                className="tableau-column"
                onClick={() =>
                  column.length === 0 ? tapEmptyPile(to) : undefined
                }
              >
                {column.length === 0 && (
                  <div className="pile-placeholder column-empty" />
                )}
                {column.map((card, cardIndex) => (
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
                    className="stacked"
                    style={{ top: `${offsetForIndex(column, cardIndex)}px` }}
                    selected={isSelected(to, cardIndex)}
                    onClick={
                      card.faceUp ? () => tapCard(to, cardIndex) : undefined
                    }
                  />
                ))}
              </div>
            );
          })}
        </div>
        </LayoutGroup>
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
