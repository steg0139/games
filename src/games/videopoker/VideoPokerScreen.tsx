import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PlayingCard from "../../components/PlayingCard";
import { recordVideoPokerHand } from "../../lib/stats/useProfile";
import {
  type VideoPokerState,
  PAYTABLE,
  STARTING_BANKROLL,
  deal,
  draw,
  newGame,
  nextHand,
  rankLabel,
  setBet,
  toggleHold,
} from "./logic";
import { clearBankroll, loadBankroll, saveBankroll } from "./bankroll";
import "../../styles/bet-controls.css";
import "./VideoPoker.css";

const BET_STEP = 5;

export default function VideoPokerScreen() {
  const [state, setState] = useState<VideoPokerState>(() =>
    newGame(loadBankroll()),
  );
  const recordedResult = useRef(false);

  useEffect(() => {
    saveBankroll(state.bankroll);
  }, [state.bankroll]);

  // Record each completed hand once.
  useEffect(() => {
    if (state.phase === "result" && state.result && !recordedResult.current) {
      recordedResult.current = true;
      recordVideoPokerHand({
        paid: state.payout > 0,
        payout: state.payout,
        bankroll: state.bankroll,
      });
    } else if (state.phase !== "result") {
      recordedResult.current = false;
    }
  }, [state.phase, state.result, state.payout, state.bankroll]);

  const adjustBet = useCallback((delta: number) => {
    setState((s) => setBet(s, s.bet + delta));
  }, []);
  // Bet all remaining chips (setBet clamps to the bankroll).
  const maxBet = useCallback(() => {
    setState((s) => setBet(s, s.bankroll));
  }, []);
  // Free-typed bet: keep digits only; setBet clamps to the legal range.
  const typeBet = useCallback((raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    const value = digits === "" ? 0 : parseInt(digits, 10);
    setState((s) => setBet(s, value));
  }, []);
  const startHand = useCallback(() => setState((s) => deal(s)), []);
  const doDraw = useCallback(() => setState((s) => draw(s)), []);
  const continueGame = useCallback(() => setState((s) => nextHand(s)), []);
  const toggle = useCallback(
    (i: number) => setState((s) => toggleHold(s, i)),
    [],
  );
  const restart = useCallback(() => {
    clearBankroll();
    setState(newGame(STARTING_BANKROLL));
  }, []);

  const broke = state.phase === "betting" && state.bankroll < 5;
  const won = state.phase === "result" && state.payout > 0;

  return (
    <div className="videopoker">
      <header className="app-bar">
        <Link to="/" className="icon-btn" aria-label="Back to menu">
          ←
        </Link>
        <h1>Video Poker</h1>
        <span className="status-line">${state.bankroll}</span>
      </header>

      <div className="vp-felt">
        {/* Paytable */}
        <div className="paytable">
          {PAYTABLE.filter((p) => p.rank !== "none").map((p) => (
            <div
              key={p.rank}
              className={`paytable-row ${
                state.result === p.rank ? "hit" : ""
              }`}
            >
              <span className="pt-label">{p.label}</span>
              <span className="pt-mult">{p.mult}×</span>
            </div>
          ))}
        </div>

        {/* Result message */}
        <div className="vp-message">
          {state.phase === "result" &&
            (won ? (
              <div className="vp-badge win">
                {rankLabel(state.result!)} — won ${state.payout}
              </div>
            ) : (
              <div className="vp-badge">No win</div>
            ))}
          {state.phase === "draw" && (
            <div className="turn-hint">Tap cards to hold, then Draw</div>
          )}
        </div>

        {/* Hand */}
        <div className="vp-hand">
          {state.hand.length === 0
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="vp-slot" />
              ))
            : state.hand.map((card, i) => (
                <div key={`${card.id}-${i}`} className="vp-card-wrap">
                  <PlayingCard
                    card={card}
                    entrance
                    layoutId={null}
                    onClick={
                      state.phase === "draw" ? () => toggle(i) : undefined
                    }
                    className={state.held[i] ? "held" : ""}
                  />
                  {state.phase === "draw" && state.held[i] && (
                    <span className="held-tag">HELD</span>
                  )}
                </div>
              ))}
        </div>
      </div>

      {/* Controls */}
      <div className="vp-controls">
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
                    value={state.bet === 0 ? "" : state.bet}
                    onChange={(e) => typeBet(e.target.value)}
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
            <button className="icon-btn" onClick={maxBet} aria-label="Bet max">
              Max
            </button>
            <button className="btn-primary wide" onClick={startHand}>
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

        {state.phase === "draw" && (
          <div className="action-row">
            <button className="btn-primary wide" onClick={doDraw}>
              Draw
            </button>
          </div>
        )}

        {state.phase === "result" && (
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
