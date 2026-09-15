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
  canSplit,
  deal,
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
    setState((s) => setBet(s, s.bet + delta));
  }, []);

  const startRound = useCallback(() => setState((s) => deal(s)), []);
  const doHit = useCallback(() => setState((s) => hit(s)), []);
  const doStand = useCallback(() => setState((s) => stand(s)), []);
  const doSplit = useCallback(() => setState((s) => split(s)), []);
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
              <div className="bet-amount">
                <span className="bet-label">Bet</span>
                <span className="bet-value">${state.bet}</span>
              </div>
              <button
                className="icon-btn"
                onClick={() => adjustBet(BET_STEP)}
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
