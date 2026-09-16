import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Crossword from "@jaredreisinger/react-crossword";
import { recordCrosswordComplete } from "../../lib/stats/useProfile";
import {
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

export default function CrosswordScreen() {
  const today = useMemo(() => new Date(), []);
  const id = dailyId(today);
  const puzzle = useMemo(() => puzzleForDay(today), [today]);
  const { data, placed, total } = useMemo(
    () => buildCrosswordData(puzzle),
    [puzzle],
  );

  const [solved, setSolved] = useState(false);

  const onComplete = useCallback(
    (correct: boolean) => {
      if (correct) {
        setSolved(true);
        recordCrosswordComplete(dayNumber(today));
      }
    },
    [today],
  );

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
