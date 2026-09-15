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
  drawFromStock,
  isWon,
  moveCard,
  newGame,
} from "./logic";
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
  const [state, setState] = useState<SolitaireState>(() => newGame());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [moves, setMoves] = useState(0);
  // Bumped on every new game so the deal-in animation replays.
  const [dealId, setDealId] = useState(0);
  const startedAt = useRef<number>(Date.now());
  const recordedWin = useRef(false);

  const profile = useProfile();
  const drawCount = profile.settings.solitaireDrawCount;

  const won = useMemo(() => isWon(state), [state]);

  const reset = useCallback(() => {
    setState(newGame());
    setSelection(null);
    setMoves(0);
    setDealId((n) => n + 1);
    startedAt.current = Date.now();
    recordedWin.current = false;
  }, []);

  // Changing the draw mode can't apply mid-game, so start a fresh deal.
  const prevDrawCount = useRef(drawCount);
  useEffect(() => {
    if (prevDrawCount.current !== drawCount) {
      prevDrawCount.current = drawCount;
      reset();
    }
  }, [drawCount, reset]);

  // Record the win exactly once when the board is completed.
  useEffect(() => {
    if (won && !recordedWin.current) {
      recordedWin.current = true;
      recordSolitaireResult({
        won: true,
        moves,
        timeSeconds: Math.round((Date.now() - startedAt.current) / 1000),
      });
    }
  }, [won, moves]);

  const applyMove = useCallback(
    (from: PileId, cardIndex: number, to: PileId) => {
      const next = moveCard(state, from, cardIndex, to);
      if (next) {
        setState(next);
        setMoves((m) => m + 1);
      }
      setSelection(null);
    },
    [state],
  );

  const handleStock = useCallback(() => {
    setState((s) => drawFromStock(s, drawCount));
    setSelection(null);
  }, [drawCount]);

  // Tap logic: if nothing selected, try auto-move; if that fails, select.
  // If something selected, treat the new tap as a destination.
  const tapCard = useCallback(
    (from: PileId, cardIndex: number) => {
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
    [selection, state, applyMove],
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
                <PlayingCard
                  card={state.stock[state.stock.length - 1]}
                  animate
                />
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
                    // Deal-in stagger only on a fresh board (before any move),
                    // so mid-game moves don't re-trigger an entrance.
                    entrance={moves === 0}
                    entranceDelay={
                      moves === 0
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
