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
  deal,
  handValue,
  hit,
  newGame,
  nextRound,
  outcomeText,
  setBet,
  stand,
} from "./logic";

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
import "./Blackjack.css";

const BET_STEPS = [5, 25, 100];

export default function BlackjackScreen() {
  const [state, setState] = useState<BlackjackState>(() => newGame());
  const recordedOutcome = useRef(false);

  // Record each hand once, when it settles. Reset the guard when a new hand
  // is dealt (phase leaves "settled").
  useEffect(() => {
    if (state.phase === "settled" && state.outcome && !recordedOutcome.current) {
      recordedOutcome.current = true;
      recordBlackjackHand(outcomeToResult(state.outcome), state.bankroll);
    } else if (state.phase !== "settled") {
      recordedOutcome.current = false;
    }
  }, [state.phase, state.outcome, state.bankroll]);

  const adjustBet = useCallback((delta: number) => {
    setState((s) => setBet(s, s.bet + delta));
  }, []);

  const startRound = useCallback(() => setState((s) => deal(s)), []);
  const doHit = useCallback(() => setState((s) => hit(s)), []);
  const doStand = useCallback(() => setState((s) => stand(s)), []);
  const continueGame = useCallback(() => setState((s) => nextRound(s)), []);
  const restart = useCallback(() => setState(newGame()), []);

  const dealerShownValue =
    state.phase === "player"
      ? handValue(state.dealer.filter((c) => c.faceUp))
      : handValue(state.dealer);

  const playerValue = handValue(state.player);
  const broke = state.phase === "betting" && state.bankroll < 5;

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
                  className="hand-card"
                />
              ))
            )}
          </div>
        </section>

        {/* Center message */}
        <div className="bj-center">
          {state.outcome && (
            <div className="outcome-badge">{outcomeText(state.outcome)}</div>
          )}
          {state.phase === "player" && (
            <div className="turn-hint">Your move</div>
          )}
        </div>

        {/* Player */}
        <section className="hand-area">
          <div className="hand">
            {state.player.length === 0 ? (
              <div className="empty-hand">—</div>
            ) : (
              state.player.map((card, i) => (
                <PlayingCard
                  key={`${card.id}-${i}`}
                  card={card}
                  className="hand-card"
                />
              ))
            )}
          </div>
          <div className="hand-label">
            <span>You</span>
            {state.player.length > 0 && (
              <span className="hand-total">{playerValue}</span>
            )}
          </div>
        </section>
      </div>

      {/* Controls */}
      <div className="bj-controls">
        {state.phase === "betting" && !broke && (
          <div className="bet-row">
            <div className="bet-stepper">
              <button
                className="icon-btn"
                onClick={() => adjustBet(-BET_STEPS[1])}
                aria-label="Lower bet"
              >
                −
              </button>
              <div className="bet-amount">
                <span className="bet-label">Bet</span>
                <span className="bet-value">${state.bet}</span>
              </div>
              <button
                className="icon-btn"
                onClick={() => adjustBet(BET_STEPS[1])}
                aria-label="Raise bet"
              >
                +
              </button>
            </div>
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
