import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  recordSudokuComplete,
  updateSettings,
  useProfile,
} from "../../lib/stats/useProfile";
import { dayNumberForKey, todayKey } from "../../lib/daily";
import type { SudokuDifficulty } from "../../lib/stats/types";
import {
  CELLS,
  SIZE,
  type SudokuPuzzle,
  conflictingCells,
  isSolved,
} from "./logic";
import {
  getRandomSudoku,
  getTodaysSudoku,
} from "./client";
import "./Sudoku.css";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; puzzle: SudokuPuzzle; storageId: string };

// Per-day progress persistence: the player's entries, keyed so each
// day+difficulty (and practice session) keeps its own board.
function progressKey(storageId: string): string {
  return `cards.sudoku.progress.${storageId}`;
}

function loadProgress(storageId: string, givens: number[]): number[] | null {
  try {
    const raw = localStorage.getItem(progressKey(storageId));
    if (!raw) return null;
    const arr = JSON.parse(raw) as number[];
    if (!Array.isArray(arr) || arr.length !== CELLS) return null;
    // Givens always win over stored values (guards against a stale/mismatched save).
    return arr.map((v, i) => (givens[i] !== 0 ? givens[i] : v || 0));
  } catch {
    return null;
  }
}

function saveProgress(storageId: string, entries: number[]): void {
  try {
    localStorage.setItem(progressKey(storageId), JSON.stringify(entries));
  } catch {
    /* non-fatal */
  }
}

export default function SudokuScreen() {
  const profile = useProfile();
  const difficulty = profile.settings.sudokuDifficulty;

  // Central-day key; refetch across midnight when open/backgrounded.
  const [dayKey, setDayKey] = useState(() => todayKey());
  const today = useMemo(() => new Date(), [dayKey]);
  useEffect(() => {
    const checkDay = () =>
      setDayKey((prev) => {
        const now = todayKey();
        return prev === now ? prev : now;
      });
    document.addEventListener("visibilitychange", checkDay);
    window.addEventListener("focus", checkDay);
    const timer = setInterval(checkDay, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", checkDay);
      window.removeEventListener("focus", checkDay);
      clearInterval(timer);
    };
  }, []);

  // Practice mode: a random puzzle that doesn't touch the daily or stats.
  const [practiceSeed, setPracticeSeed] = useState<number | null>(null);
  const isPractice = practiceSeed !== null;

  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  // Player entries (81 cells). Separate from givens so we know what's editable.
  const [entries, setEntries] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);

  const givens = load.status === "ready" ? load.puzzle.givens : null;
  const solution = load.status === "ready" ? load.puzzle.solution : null;
  const storageId = load.status === "ready" ? load.storageId : "loading";

  const loadedPracticeSeed = useRef<number | null>(null);

  // Fetch the puzzle (daily per difficulty, or practice). Refetch the daily on
  // difficulty change or day rollover; don't reshuffle practice on rollover.
  useEffect(() => {
    let cancelled = false;

    const applyPuzzle = (puzzle: SudokuPuzzle, sid: string) => {
      if (cancelled) return;
      const restored =
        (!isPractice && loadProgress(sid, puzzle.givens)) || puzzle.givens.slice();
      setLoad({ status: "ready", puzzle, storageId: sid });
      setEntries(restored);
      setSelected(null);
      setSolved(isSolved(restored, puzzle.solution));
    };

    if (isPractice) {
      if (loadedPracticeSeed.current === practiceSeed) return;
      loadedPracticeSeed.current = practiceSeed;
      setLoad({ status: "loading" });
      (async () => {
        const puzzle = await getRandomSudoku(difficulty);
        if (cancelled) return;
        if (puzzle) applyPuzzle(puzzle, `practice-${practiceSeed}-${difficulty}`);
        else setLoad({ status: "error" });
      })();
    } else {
      loadedPracticeSeed.current = null;
      setLoad({ status: "loading" });
      (async () => {
        const res = await getTodaysSudoku(difficulty);
        if (cancelled) return;
        if (res) applyPuzzle(res.puzzle, `daily-${res.date}-${difficulty}`);
        else setLoad({ status: "error" });
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [isPractice, practiceSeed, difficulty, dayKey]);

  const conflicts = useMemo(() => conflictingCells(entries), [entries]);

  const setDifficulty = useCallback((d: SudokuDifficulty) => {
    updateSettings({ sudokuDifficulty: d });
  }, []);

  const placeValue = useCallback(
    (value: number) => {
      if (solved || selected === null || !givens || !solution) return;
      if (givens[selected] !== 0) return; // can't edit a given
      // Compute the next board from the current entries, then apply side
      // effects (persist, completion) outside the state updater.
      const next = entries.slice();
      next[selected] = next[selected] === value ? 0 : value; // tap again clears
      setEntries(next);
      if (!isPractice) saveProgress(storageId, next);
      if (isSolved(next, solution)) {
        setSolved(true);
        if (!isPractice) recordSudokuComplete(dayNumberForKey(todayKey()));
      }
    },
    [solved, selected, givens, solution, isPractice, storageId, entries],
  );

  const eraseCell = useCallback(() => {
    if (solved || selected === null || !givens) return;
    if (givens[selected] !== 0) return;
    const next = entries.slice();
    next[selected] = 0;
    setEntries(next);
    if (!isPractice) saveProgress(storageId, next);
  }, [solved, selected, givens, isPractice, storageId, entries]);

  const startPractice = useCallback(() => {
    setSolved(false);
    setSelected(null);
    setPracticeSeed((n) => (n ?? 0) + 1);
  }, []);
  const exitPractice = useCallback(() => {
    setSolved(false);
    setSelected(null);
    setPracticeSeed(null);
  }, []);

  // Keyboard support on desktop (1-9 to fill, 0/Backspace to erase, arrows move).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selected === null) return;
      if (e.key >= "1" && e.key <= "9") placeValue(Number(e.key));
      else if (e.key === "0" || e.key === "Backspace" || e.key === "Delete")
        eraseCell();
      else if (e.key === "ArrowRight") setSelected((s) => (s === null ? 0 : Math.min(CELLS - 1, s + 1)));
      else if (e.key === "ArrowLeft") setSelected((s) => (s === null ? 0 : Math.max(0, s - 1)));
      else if (e.key === "ArrowDown") setSelected((s) => (s === null ? 0 : Math.min(CELLS - 1, s + SIZE)));
      else if (e.key === "ArrowUp") setSelected((s) => (s === null ? 0 : Math.max(0, s - SIZE)));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, placeValue, eraseCell]);

  const dateLabel = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // How many of each digit remain to place (a filled-count helper for the pad).
  const remaining = useMemo(() => {
    const counts = new Array(10).fill(0);
    for (const v of entries) if (v > 0) counts[v]++;
    return counts;
  }, [entries]);

  const title = isPractice ? "Practice Sudoku" : "Daily Sudoku";

  if (load.status !== "ready" || !givens || !solution) {
    return (
      <div className="sudoku">
        <header className="app-bar">
          <Link to="/" className="icon-btn" aria-label="Back to menu">
            ←
          </Link>
          <h1>{title}</h1>
        </header>
        <div className="sudoku-status">
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
      </div>
    );
  }

  const selectedValue = selected !== null ? entries[selected] : 0;

  return (
    <div className="sudoku">
      <header className="app-bar">
        <Link to="/" className="icon-btn" aria-label="Back to menu">
          ←
        </Link>
        <h1>{title}</h1>
      </header>

      <div className="sudoku-body">
        <div className="sudoku-heading">
          <span className="sudoku-date">
            {isPractice ? "Practice puzzle" : dateLabel}
          </span>
        </div>

        {/* Difficulty picker (daily only). Switching reloads that difficulty's
            daily; either difficulty counts for the single streak. */}
        {!isPractice && (
          <div className="segmented sudoku-diff" role="group" aria-label="Sudoku difficulty">
            {(["easy", "regular"] as SudokuDifficulty[]).map((d) => (
              <button
                key={d}
                className={`segment ${difficulty === d ? "active" : ""}`}
                aria-pressed={difficulty === d}
                onClick={() => setDifficulty(d)}
              >
                {d === "easy" ? "Easy" : "Regular"}
              </button>
            ))}
          </div>
        )}

        <div className="sudoku-practice-row">
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
          <div className="sudoku-solved" role="status">
            {isPractice
              ? "Solved! Try another practice puzzle."
              : "Solved! Come back tomorrow for a new puzzle."}
          </div>
        )}

        <div
          className="sudoku-grid"
          role="grid"
          aria-label="Sudoku grid"
        >
          {Array.from({ length: CELLS }, (_, i) => {
            const row = Math.floor(i / SIZE);
            const col = i % SIZE;
            const val = entries[i];
            const isGiven = givens[i] !== 0;
            const isSel = selected === i;
            const inConflict = conflicts.has(i);
            // Highlight all cells sharing the selected cell's value.
            const sameValue =
              selectedValue > 0 && val === selectedValue && !isSel;
            const cls = [
              "sudoku-cell",
              isGiven ? "given" : "entry",
              isSel ? "selected" : "",
              inConflict ? "conflict" : "",
              sameValue ? "same-value" : "",
              col % 3 === 2 && col !== 8 ? "box-right" : "",
              row % 3 === 2 && row !== 8 ? "box-bottom" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={i}
                className={cls}
                role="gridcell"
                aria-label={`row ${row + 1} column ${col + 1}${val ? `, ${val}` : ", empty"}`}
                onClick={() => setSelected(i)}
                disabled={solved}
              >
                {val !== 0 ? val : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* Number pad pinned at the bottom. */}
      {!solved && (
        <div className="sudoku-pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              className={`sudoku-key ${remaining[n] >= 9 ? "done" : ""}`}
              onClick={() => placeValue(n)}
              disabled={selected === null || givens[selected] !== 0}
            >
              {n}
            </button>
          ))}
          <button
            className="sudoku-key sudoku-erase"
            onClick={eraseCell}
            disabled={selected === null || givens[selected] !== 0}
            aria-label="Erase"
          >
            ⌫
          </button>
        </div>
      )}
    </div>
  );
}
