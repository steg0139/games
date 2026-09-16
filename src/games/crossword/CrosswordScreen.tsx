import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Crossword, {
  type CrosswordImperative,
} from "@jaredreisinger/react-crossword";
import { recordCrosswordComplete } from "../../lib/stats/useProfile";
import {
  type CrosswordData,
  buildCrosswordData,
  dailyId,
  dayNumber,
  puzzleForDay,
} from "./logic";
import "./Crossword.css";

// Theme matching the app's dark slate look.
const CROSSWORD_THEME = {
  gridBackground: "#0c3325",
  cellBackground: "#f8fafc",
  cellBorder: "#cbd5e1",
  textColor: "#1e293b",
  numberColor: "#64748b",
  focusBackground: "#7dd3fc",
  highlightBackground: "#bae6fd",
};

/** Flatten crossword data into every filled grid cell with its letter. */
function gridCells(data: CrosswordData): { row: number; col: number; letter: string }[] {
  const cells = new Map<string, { row: number; col: number; letter: string }>();
  const add = (r: number, c: number, letter: string) => {
    cells.set(`${r},${c}`, { row: r, col: c, letter });
  };
  for (const entry of Object.values(data.across)) {
    for (let i = 0; i < entry.answer.length; i++) {
      add(entry.row, entry.col + i, entry.answer[i]);
    }
  }
  for (const entry of Object.values(data.down)) {
    for (let i = 0; i < entry.answer.length; i++) {
      add(entry.row + i, entry.col, entry.answer[i]);
    }
  }
  return [...cells.values()];
}

export default function CrosswordScreen() {
  const today = useMemo(() => new Date(), []);
  const id = dailyId(today);
  const puzzle = useMemo(() => puzzleForDay(today), [today]);
  const { data, placed, total } = useMemo(
    () => buildCrosswordData(puzzle),
    [puzzle],
  );

  const [solved, setSolved] = useState(false);
  const crosswordRef = useRef<CrosswordImperative>(null);
  const revealed = useRef<Set<string>>(new Set());

  const onComplete = useCallback(
    (correct: boolean) => {
      if (correct) {
        setSolved(true);
        recordCrosswordComplete(dayNumber(today));
      }
    },
    [today],
  );

  // Reveal one letter: pick a grid cell we haven't revealed yet and fill it in
  // with the correct letter via the imperative API.
  const revealLetter = useCallback(() => {
    const cells = gridCells(data);
    const remaining = cells.filter(
      (c) => !revealed.current.has(`${c.row},${c.col}`),
    );
    if (remaining.length === 0) return;
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    revealed.current.add(`${pick.row},${pick.col}`);
    crosswordRef.current?.setGuess(pick.row, pick.col, pick.letter);
  }, [data]);

  const dateLabel = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="crossword">
      <header className="app-bar">
        <Link to="/" className="icon-btn" aria-label="Back to menu">
          ←
        </Link>
        <h1>Daily Crossword</h1>
        <button
          className="icon-btn"
          onClick={revealLetter}
          disabled={solved}
          aria-label="Reveal a letter"
        >
          Reveal
        </button>
      </header>

      <div className="cw-body">
        <div className="cw-heading">
          <span className="cw-date">{dateLabel}</span>
          <span className="cw-title">{puzzle.title}</span>
          {placed < total && (
            <span className="cw-note">
              {placed} of {total} words fit today's grid
            </span>
          )}
        </div>

        {solved && (
          <div className="cw-solved" role="status">
            Solved! Come back tomorrow for a new puzzle.
          </div>
        )}

        {/* Keyed by day so each day's progress is stored separately. */}
        <div className="cw-grid-wrap">
          <Crossword
            key={id}
            ref={crosswordRef}
            data={data}
            useStorage
            theme={CROSSWORD_THEME}
            onCrosswordComplete={onComplete}
          />
        </div>
      </div>
    </div>
  );
}
