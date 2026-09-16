import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  CrosswordProvider,
  DirectionClues,
  type CrosswordProviderImperative,
} from "@jaredreisinger/react-crossword";
import CrosswordGridCustom from "./CrosswordGridCustom";
import { recordCrosswordComplete } from "../../lib/stats/useProfile";
import CrosswordKeyboard, {
  type ActiveClue,
  type Selection,
} from "./CrosswordKeyboard";
import { type CrosswordData } from "./logic";
import {
  getRandomPuzzle,
  getTodaysPuzzle,
  todayKey,
} from "./client";
import "./Crossword.css";

// Theme tuned for readable contrast (active clue text stays legible).
// allowNonSquare: render the grid at its true rows×cols instead of forcing a
// square — otherwise a wide-or-tall puzzle pads out to a square, leaving a big
// block of empty cells below the actual words.
const CROSSWORD_THEME = {
  allowNonSquare: true,
  gridBackground: "#0c3325",
  cellBackground: "#f8fafc",
  cellBorder: "#94a3b8",
  textColor: "#1e293b",
  numberColor: "#64748b",
  focusBackground: "#38bdf8",
  highlightBackground: "#a5d8ef",
};

/** Every filled grid cell with its correct letter. */
function gridCells(data: CrosswordData) {
  const cells = new Map<string, { row: number; col: number; letter: string }>();
  const add = (r: number, c: number, letter: string) =>
    cells.set(`${r},${c}`, { row: r, col: c, letter });
  for (const e of Object.values(data.across))
    for (let i = 0; i < e.answer.length; i++) add(e.row, e.col + i, e.answer[i]);
  for (const e of Object.values(data.down))
    for (let i = 0; i < e.answer.length; i++) add(e.row + i, e.col, e.answer[i]);
  return [...cells.values()];
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: CrosswordData; storageId: string };

export default function CrosswordScreen() {
  const today = useMemo(() => new Date(), []);

  // Practice mode: a random puzzle from the backend that doesn't touch the
  // daily's saved progress or stats. `practiceSeed` bumps to load a new one.
  const [practiceSeed, setPracticeSeed] = useState<number | null>(null);
  const isPractice = practiceSeed !== null;

  // The puzzle is fetched from the backend (daily is canonical + cached).
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    (async () => {
      if (isPractice) {
        const data = await getRandomPuzzle();
        if (cancelled) return;
        setLoad(
          data
            ? { status: "ready", data, storageId: `practice-${practiceSeed}` }
            : { status: "error" },
        );
      } else {
        const res = await getTodaysPuzzle();
        if (cancelled) return;
        setLoad(
          res
            ? { status: "ready", data: res.data, storageId: `daily-${res.date}` }
            : { status: "error" },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPractice, practiceSeed]);

  const data = load.status === "ready" ? load.data : null;
  const id = load.status === "ready" ? load.storageId : "loading";

  const [solved, setSolved] = useState(false);
  const [active, setActive] = useState<ActiveClue | null>(null);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);

  const cwRef = useRef<CrosswordProviderImperative>(null);
  const revealed = useRef<Set<string>>(new Set());
  // Track the player's current entries: "row,col" -> guessed char.
  const guesses = useRef<Map<string, string>>(new Map());
  // Currently focused cell, mirrored from the crossword context by the keyboard.
  const selectionRef = useRef<Selection | null>(null);

  // One-time cleanup: earlier builds stored progress under the default
  // "guesses" key (shared across days), which could load the wrong puzzle's
  // letters. Remove it so per-day keys are the only source of truth.
  useMemo(() => {
    try {
      localStorage.removeItem("guesses");
    } catch {
      /* ignore */
    }
  }, []);

  const onComplete = useCallback(
    (correct: boolean) => {
      if (correct) {
        setSolved(true);
        setCheckMsg(null);
        // Practice puzzles don't count toward stats or streaks. Use the UTC
        // day number so streaks line up with the server's canonical daily.
        if (!isPractice) {
          recordCrosswordComplete(
            Math.floor(Date.parse(`${todayKey()}T00:00:00Z`) / 86_400_000),
          );
        }
      }
    },
    [today, isPractice],
  );

  // Start a fresh practice puzzle / return to the daily. Resets per-game state.
  const startPractice = useCallback(() => {
    revealed.current = new Set();
    guesses.current = new Map();
    setSolved(false);
    setCheckMsg(null);
    setActive(null);
    setPracticeSeed((n) => (n ?? 0) + 1);
  }, []);

  const exitPractice = useCallback(() => {
    revealed.current = new Set();
    guesses.current = new Map();
    setSolved(false);
    setCheckMsg(null);
    setActive(null);
    setPracticeSeed(null);
  }, []);

  const onCellChange = useCallback((row: number, col: number, char: string) => {
    const key = `${row},${col}`;
    if (char) guesses.current.set(key, char);
    else guesses.current.delete(key);
    setCheckMsg(null); // typing invalidates a prior check result
  }, []);

  const check = useCallback(() => {
    if (!data) return;
    const cells = gridCells(data);
    let filled = 0;
    let wrong = 0;
    for (const c of cells) {
      const g = guesses.current.get(`${c.row},${c.col}`);
      if (!g) continue;
      filled++;
      if (g.toUpperCase() !== c.letter.toUpperCase()) wrong++;
    }
    if (filled === 0) setCheckMsg("Fill in some letters first.");
    else if (wrong === 0) setCheckMsg("Everything filled in so far is correct.");
    else setCheckMsg(`${wrong} of ${filled} filled letters ${wrong === 1 ? "is" : "are"} wrong.`);
  }, [data]);

  const revealLetter = useCallback(() => {
    if (!data) return;
    const cells = gridCells(data);
    const byPos = new Map(cells.map((c) => [`${c.row},${c.col}`, c]));

    // Prefer the currently selected cell.
    const sel = selectionRef.current;
    let pick = sel ? byPos.get(`${sel.row},${sel.col}`) : undefined;

    // Otherwise reveal any not-yet-revealed cell.
    if (!pick) {
      const remaining = cells.filter(
        (c) => !revealed.current.has(`${c.row},${c.col}`),
      );
      if (remaining.length === 0) return;
      pick = remaining[Math.floor(Math.random() * remaining.length)];
    }

    revealed.current.add(`${pick.row},${pick.col}`);
    guesses.current.set(`${pick.row},${pick.col}`, pick.letter);
    cwRef.current?.setGuess(pick.row, pick.col, pick.letter);
  }, [data]);

  const dateLabel = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="crossword">
      {load.status !== "ready" || !data ? (
        <>
          <header className="app-bar">
            <Link to="/" className="icon-btn" aria-label="Back to menu">
              ←
            </Link>
            <h1>{isPractice ? "Practice" : "Daily Crossword"}</h1>
          </header>
          <div className="cw-status">
            {load.status === "loading" ? (
              <p>Loading today's puzzle…</p>
            ) : (
              <>
                <p>Couldn't load the puzzle. Check your connection.</p>
                <button
                  className="btn-primary"
                  onClick={() => window.location.reload()}
                >
                  Retry
                </button>
              </>
            )}
          </div>
        </>
      ) : (
      <CrosswordProvider
        key={id}
        ref={cwRef}
        data={data}
        useStorage={!isPractice}
        storageKey={`crossword-${id}`}
        theme={CROSSWORD_THEME}
        onCrosswordComplete={onComplete}
        onCellChange={onCellChange}
      >
        <header className="app-bar">
          <Link to="/" className="icon-btn" aria-label="Back to menu">
            ←
          </Link>
          <h1>{isPractice ? "Practice" : "Daily Crossword"}</h1>
          <button className="icon-btn" onClick={check} disabled={solved}>
            Check
          </button>
          <button className="icon-btn" onClick={revealLetter} disabled={solved}>
            Reveal
          </button>
        </header>

        <div className="cw-body">
          <div className="cw-heading">
            <span className="cw-date">
              {isPractice ? "Practice puzzle" : dateLabel}
            </span>
          </div>

          {/* Practice controls (temporary — for testing puzzles). */}
          <div className="cw-practice-row">
            {isPractice ? (
              <>
                <button className="icon-btn" onClick={startPractice}>
                  New practice puzzle
                </button>
                <button className="icon-btn" onClick={exitPractice}>
                  Back to daily
                </button>
              </>
            ) : (
              <button className="icon-btn" onClick={startPractice}>
                Practice a random puzzle
              </button>
            )}
          </div>

          {solved && (
            <div className="cw-solved" role="status">
              {isPractice
                ? "Solved! Try another practice puzzle."
                : "Solved! Come back tomorrow for a new puzzle."}
            </div>
          )}
          {checkMsg && !solved && (
            <div className="cw-check" role="status">
              {checkMsg}
            </div>
          )}

          <div className="cw-grid-wrap">
            <CrosswordGridCustom />
          </div>

          <div className="cw-clue-lists">
            <DirectionClues direction="across" />
            <DirectionClues direction="down" />
          </div>
        </div>

        {/* Current clue pinned directly above our keyboard, so it's always
            visible right where you're typing. */}
        {!solved && (
          <div className="cw-dock">
            <div className="cw-current-clue">
              {active ? (
                <>
                  <span className="cw-current-dir">
                    {active.number} {active.direction}
                  </span>
                  <span className="cw-current-text">{active.text}</span>
                </>
              ) : (
                <span className="cw-current-text muted">
                  Tap a cell to start
                </span>
              )}
            </div>
            {/* Our own keyboard (drives the grid via context). No OS keyboard,
                so no autofill prompts and nothing covers the grid or clue. It
                also reports the active clue for the current cell. */}
            <CrosswordKeyboard
              selectionRef={selectionRef}
              onActiveClue={setActive}
            />
          </div>
        )}
      </CrosswordProvider>
      )}
    </div>
  );
}
