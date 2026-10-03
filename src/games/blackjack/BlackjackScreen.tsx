import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PlayingCard from "../../components/PlayingCard";
import {
  type BlackjackResult,
  recordBlackjackHand,
} from "../../lib/stats/useProfile";
import {
  type BlackjackState,
  type Outcome,
  STARTING_BANKROLL,
  canDouble,
  canSplit,
  deal,
  double,
  handValue,
  hit,
  newGame,
  nextRound,
  outcomeText,
  setBet,
  split,
  stand,
} from "./logic";
import { clearBankroll, loadBankroll, saveBankroll } from "./bankroll";
import "../../styles/bet-controls.css";
import "./Blackjack.css";

function outcomeToResult(outcome: Outcome): BlackjackResult {
  switch (outcome) {
    case "player_blackjack":
      return "blackjack";
    case "player_win":
    case "dealer_bust":
      return "win";
    case "dealer_win":
    case "player_bust":
      return "loss";
    case "push":
      return "push";
  }
}

const BET_STEP = 25;

export default function BlackjackScreen() {
  const [state, setState] = useState<BlackjackState>(() =>
    newGame(loadBankroll()),
  );
  const recordedRound = useRef(false);
  // While the bet field is focused, holds the raw typed digits (unclamped) so
  // free typing isn't snapped mid-entry. null = not editing (show state.bet).
  const [betDraft, setBetDraft] = useState<string | null>(null);

  // Persist the wallet whenever it changes.
  useEffect(() => {
    saveBankroll(state.bankroll);
  }, [state.bankroll]);

  // Record each settled round's hands once (a split produces multiple).
  useEffect(() => {
    if (state.phase === "settled" && !recordedRound.current) {
      recordedRound.current = true;
      for (const hand of state.hands) {
        if (hand.outcome) {
          recordBlackjackHand(outcomeToResult(hand.outcome), state.bankroll);
        }
      }
    } else if (state.phase !== "settled") {
      recordedRound.current = false;
    }
  }, [state.phase, state.hands, state.bankroll]);

  const adjustBet = useCallback((delta: number) => {
    setBetDraft(null);
    setState((s) => setBet(s, s.bet + delta));
  }, []);

  // Bet all remaining chips (setBet clamps to the bankroll).
  const maxBet = useCallback(() => {
    setBetDraft(null);
    setState((s) => setBet(s, s.bankroll));
  }, []);

  // Free typing: while the field is focused we hold exactly what was typed
  // (digits only) in `betDraft` without clamping, so a value like "10" isn't
  // snapped to the minimum the instant you type "1". Clamping to
  // [MIN_BET, bankroll] happens on blur (commitBet).
  const typeBet = useCallback((raw: string) => {
    setBetDraft(raw.replace(/[^0-9]/g, ""));
  }, []);

  // Commit the typed bet when the field loses focus: empty / below the minimum
  // becomes MIN_BET; above the bankroll becomes the bankroll (both via setBet's
  // clamp). Then clear the draft so the field tracks state.bet again.
  const commitBet = useCallback(() => {
    setBetDraft((draft) => {
      if (draft !== null) {
        const value = draft === "" ? 0 : parseInt(draft, 10);
        setState((s) => setBet(s, value));
      }
      return null;
    });
  }, []);

  const startRound = useCallback(() => {
    // Commit any unblurred typed bet before dealing, then deal with the
    // clamped bet. setBet is a no-op if there's no draft.
    setState((s) => {
      const committed =
        betDraft !== null
          ? setBet(s, betDraft === "" ? 0 : parseInt(betDraft, 10))
          : s;
      return deal(committed);
    });
    setBetDraft(null);
  }, [betDraft]);
  const doHit = useCallback(() => setState((s) => hit(s)), []);
  const doStand = useCallback(() => setState((s) => stand(s)), []);
  const doSplit = useCallback(() => setState((s) => split(s)), []);
  const doDouble = useCallback(() => setState((s) => double(s)), []);
  const continueGame = useCallback(() => setState((s) => nextRound(s)), []);
  const restart = useCallback(() => {
    clearBankroll();
    setState(newGame(STARTING_BANKROLL));
  }, []);

  const dealerShownValue =
    state.phase === "player"
      ? handValue(state.dealer.filter((c) => c.faceUp))
      : handValue(state.dealer);

  const broke = state.phase === "betting" && state.bankroll < 5;
  const splittable = canSplit(state);
  const doublable = canDouble(state);
  const multiHand = state.hands.length > 1;

  return (
    <div className="blackjack">
      <header className="app-bar">
        <Link to="/" className="icon-btn" aria-label="Back to menu">
          ←
        </Link>
        <h1>Blackjack</h1>
        <span className="status-line">${state.bankroll}</span>
      </header>

      <div className="bj-felt">
        {/* Dealer */}
        <section className="hand-area">
          <div className="hand-label">
            <span>Dealer</span>
            {state.dealer.length > 0 && (
              <span className="hand-total">{dealerShownValue}</span>
            )}
          </div>
          <div className="hand">
            {state.dealer.length === 0 ? (
              <div className="empty-hand">—</div>
            ) : (
              state.dealer.map((card, i) => (
                <PlayingCard
                  key={`${card.id}-${i}`}
                  card={card}
                  entrance
                  layoutId={null}
                  className="hand-card"
                />
              ))
            )}
          </div>
        </section>

        {/* Center message */}
        <div className="bj-center">
          {state.phase === "player" && !multiHand && (
            <div className="turn-hint">Your move</div>
          )}
          {state.phase === "player" && multiHand && (
            <div className="turn-hint">Hand {state.activeHand + 1}</div>
          )}
        </div>

        {/* Player hands */}
        <div className={`player-hands ${multiHand ? "multi" : ""}`}>
          {state.hands.length === 0 ? (
            <section className="hand-area">
              <div className="hand">
                <div className="empty-hand">—</div>
              </div>
              <div className="hand-label">
                <span>You</span>
              </div>
            </section>
          ) : (
            state.hands.map((hand, hi) => {
              const isActive =
                state.phase === "player" && hi === state.activeHand;
              return (
                <section
                  key={hi}
                  className={`hand-area player-hand ${
                    isActive ? "active" : ""
                  }`}
                >
                  <div className="hand">
                    {hand.cards.map((card, i) => (
                      <PlayingCard
                        key={`${card.id}-${i}`}
                        card={card}
                        entrance
                        layoutId={null}
                        className="hand-card"
                      />
                    ))}
                  </div>
                  <div className="hand-label">
                    <span>{multiHand ? `Hand ${hi + 1}` : "You"}</span>
                    <span className="hand-total">{handValue(hand.cards)}</span>
                    {hand.outcome && (
                      <span className="hand-outcome">
                        {outcomeText(hand.outcome)}
                      </span>
                    )}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="bj-controls">
        {state.phase === "betting" && !broke && (
          <div className="bet-row">
            <div className="bet-stepper">
              <button
                className="icon-btn"
                onClick={() => adjustBet(-BET_STEP)}
                aria-label="Lower bet"
              >
                −
              </button>
              <label className="bet-amount">
                <span className="bet-label">Bet</span>
                <span className="bet-input-wrap">
                  <span className="bet-currency">$</span>
                  <input
                    className="bet-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={betDraft ?? String(state.bet)}
                    onChange={(e) => typeBet(e.target.value)}
                    onBlur={commitBet}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    aria-label="Bet amount"
                  />
                </span>
              </label>
              <button
                className="icon-btn"
                onClick={() => adjustBet(BET_STEP)}
                aria-label="Raise bet"
              >
                +
              </button>
            </div>
            <button
              className="icon-btn"
              onClick={maxBet}
              aria-label="Bet max"
            >
              Max
            </button>
            <button className="btn-primary wide" onClick={startRound}>
              Deal
            </button>
          </div>
        )}

        {broke && (
          <div className="bet-row">
            <span className="status-line">Out of chips.</span>
            <button className="btn-primary wide" onClick={restart}>
              New game
            </button>
          </div>
        )}

        {state.phase === "player" && (
          <div className="action-row">
            <button className="btn-primary wide" onClick={doHit}>
              Hit
            </button>
            <button className="icon-btn wide" onClick={doStand}>
              Stand
            </button>
            {doublable && (
              <button className="icon-btn wide" onClick={doDouble}>
                Double
              </button>
            )}
            {splittable && (
              <button className="icon-btn wide" onClick={doSplit}>
                Split
              </button>
            )}
          </div>
        )}

        {state.phase === "settled" && (
          <div className="action-row">
            <button className="btn-primary wide" onClick={continueGame}>
              Next hand
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
