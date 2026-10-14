import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PlayingCard from "../../components/PlayingCard";
import {
  DEALER_FLIP_TRANSITION,
  DEALER_REVEAL_STEP_MS,
} from "../../components/motion";
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

  // Staged dealer reveal. When a round settles, we don't dump the dealer's
  // whole hand at once — we flip the hole card, then turn over each drawn card
  // one at a time to build suspense. `dealerReveal` is how many of the settled
  // dealer's cards are currently shown face-up (Infinity = fully revealed /
  // not animating). During the reveal we suppress the result banner, stat
  // recording, and the running total until it finishes.
  const [dealerReveal, setDealerReveal] = useState(Infinity);
  const revealing = state.phase === "settled" && dealerReveal < state.dealer.length;

  // Persist the wallet whenever it changes.
  useEffect(() => {
    saveBankroll(state.bankroll);
  }, [state.bankroll]);

  // Record each settled round's hands once (a split produces multiple). Hold
  // off until the dealer reveal animation has finished so the win/loss isn't
  // "spoiled" before the cards finish turning over.
  useEffect(() => {
    if (state.phase === "settled" && !revealing && !recordedRound.current) {
      recordedRound.current = true;
      for (const hand of state.hands) {
        if (hand.outcome) {
          recordBlackjackHand(outcomeToResult(hand.outcome), state.bankroll);
        }
      }
    } else if (state.phase !== "settled") {
      recordedRound.current = false;
    }
  }, [state.phase, state.hands, state.bankroll, revealing]);

  // Drive the staged dealer reveal. On entering `settled` from active play
  // (stand/double/split), start with only the dealer's original up-card shown,
  // then reveal one more card every DEALER_REVEAL_STEP_MS until the whole hand
  // is face-up. A deal-time natural (betting -> settled) is shown immediately.
  const prevPhase = useRef(state.phase);
  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = state.phase;
    if (state.phase !== "settled") return;
    // Only animate when the player actually played the hand out.
    if (was !== "player") {
      setDealerReveal(Infinity);
      return;
    }
    // Start showing just the first dealer card (the up-card), then step up.
    setDealerReveal(1);
    let shown = 1;
    const timer = setInterval(() => {
      shown += 1;
      setDealerReveal(shown);
      if (shown >= state.dealer.length) clearInterval(timer);
    }, DEALER_REVEAL_STEP_MS);
    return () => clearInterval(timer);
  }, [state.phase, state.dealer.length]);

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

  // The dealer cards to render, with per-card faceUp reflecting the staged
  // reveal. During play we render the real hand (up-card + face-down hole).
  // While settling, `dealerReveal` is the number of cards turned face-up so
  // far. We render ONE extra card beyond that (face-down) so the next card —
  // the hole card or a hit — is already mounted showing its back and then
  // *flips* on its step, rather than popping in already face-up.
  const dealerCards: typeof state.dealer = (() => {
    if (state.phase !== "settled" || dealerReveal === Infinity) {
      return state.dealer;
    }
    // Mount the revealed cards plus the next one (still face-down). Always keep
    // at least the two original cards mounted.
    const count = Math.max(2, Math.min(dealerReveal + 1, state.dealer.length));
    return state.dealer
      .slice(0, count)
      .map((c, i) => ({ ...c, faceUp: i < dealerReveal }));
  })();
  const dealerShownValue = handValue(dealerCards.filter((c) => c.faceUp));

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
            {dealerCards.length === 0 ? (
              <div className="empty-hand">—</div>
            ) : (
              dealerCards.map((card, i) => (
                <PlayingCard
                  key={`${card.id}-${i}`}
                  card={card}
                  entrance
                  layoutId={null}
                  className="hand-card"
                  // Slower, deliberate flip during the staged dealer reveal.
                  flipTransition={
                    state.phase === "settled" ? DEALER_FLIP_TRANSITION : undefined
                  }
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
          {revealing && <div className="turn-hint">Dealer reveals…</div>}
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
                    {hand.outcome && !revealing && (
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

        {state.phase === "settled" && !revealing && (
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
