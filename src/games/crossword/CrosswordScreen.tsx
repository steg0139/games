import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  CrosswordProvider,
  CrosswordGrid,
  DirectionClues,
  type CrosswordProviderImperative,
} from "@jaredreisinger/react-crossword";
import { recordCrosswordComplete } from "../../lib/stats/useProfile";
import CrosswordKeyboard, { type Selection } from "./CrosswordKeyboard";
import {
  type CrosswordData,
  buildCrosswordData,
  dailyId,
  dayNumber,
  puzzleForDay,
} from "./logic";
import { PUZZLES } from "./puzzles";
import "./Crossword.css";

// The library's Direction type isn't re-exported from the root; it's just this.
type Direction = "across" | "down";

// Theme tuned for readable contrast (active clue text stays legible).
const CROSSWORD_THEME = {
  gridBackground: "#0c3325",
  cellBackground: "#f8fafc",
  cellBorder: "#94a3b8",
  textColor: "#1e293b",
  numberColor: "#64748b",
  focusBackground: "#38bdf8",
  highlightBackground: "#a5d8ef",
};

interface ActiveClue {
  direction: Direction;
  number: string;
  text: string;
}

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

export default function CrosswordScreen() {
  const today = useMemo(() => new Date(), []);

  // Practice mode: a random puzzle that doesn't touch the daily's saved
  // progress or stats. `practiceSeed` bumps to load a fresh random puzzle.
  const [practiceSeed, setPracticeSeed] = useState<number | null>(null);
  const isPractice = practiceSeed !== null;

  const dailyPuzzle = useMemo(() => puzzleForDay(today), [today]);
  const practicePuzzle = useMemo(
    () => PUZZLES[Math.floor(Math.random() * PUZZLES.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [practiceSeed],
  );
  const puzzle = isPractice ? practicePuzzle : dailyPuzzle;

  // Storage key: per-day for the daily; ephemeral per-session for practice
  // (so practice never collides with or overwrites daily progress).
  const id = isPractice
    ? `practice-${practiceSeed}`
    : dailyId(today);

  const { data, placed, total } = useMemo(
    () => buildCrosswordData(puzzle),
    [puzzle],
  );

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
        // Practice puzzles don't count toward stats or streaks.
        if (!isPractice) recordCrosswordComplete(dayNumber(today));
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

  const onClueSelected = useCallback(
    (direction: Direction, number: string) => {
      const entry =
        direction === "across" ? data.across[+number] : data.down[+number];
      if (entry) setActive({ direction, number, text: entry.clue });
    },
    [data],
  );

  const onCellChange = useCallback((row: number, col: number, char: string) => {
    const key = `${row},${col}`;
    if (char) guesses.current.set(key, char);
    else guesses.current.delete(key);
    setCheckMsg(null); // typing invalidates a prior check result
  }, []);

  const check = useCallback(() => {
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
      <CrosswordProvider
        key={id}
        ref={cwRef}
        data={data}
        useStorage={!isPractice}
        storageKey={`crossword-${id}`}
        theme={CROSSWORD_THEME}
        onCrosswordComplete={onComplete}
        onClueSelected={onClueSelected}
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

        {/* Current-clue bar pinned at the top (below the app bar) so the phone
            keyboard — always at the bottom — can never cover it. */}
        <div className="cw-current-clue">
          {active ? (
            <>
              <span className="cw-current-dir">
                {active.number} {active.direction}
              </span>
              <span className="cw-current-text">{active.text}</span>
            </>
          ) : (
            <span className="cw-current-text muted">Tap a cell to start</span>
          )}
        </div>

        <div className="cw-body">
          <div className="cw-heading">
            <span className="cw-date">
              {isPractice ? "Practice puzzle" : dateLabel}
            </span>
            <span className="cw-title">{puzzle.title}</span>
            {placed < total && (
              <span className="cw-note">
                {placed} of {total} words fit this grid
              </span>
            )}
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
            <CrosswordGrid />
          </div>

          <div className="cw-clue-lists">
            <DirectionClues direction="across" />
            <DirectionClues direction="down" />
          </div>
        </div>

        {/* Our own keyboard (drives the grid via context). No OS keyboard, so
            no autofill prompts and nothing covers the grid or clue bar. */}
        {!solved && <CrosswordKeyboard selectionRef={selectionRef} />}
      </CrosswordProvider>
    </div>
  );
}
