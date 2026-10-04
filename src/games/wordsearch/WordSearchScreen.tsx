import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  recordWordSearchComplete,
  updateSettings,
  useProfile,
} from "../../lib/stats/useProfile";
import { dayNumberForKey, todayKey } from "../../lib/daily";
import type { WordSearchDifficulty } from "../../lib/stats/types";
import {
  type WordSearchPuzzle,
  lineBetween,
  matchWord,
  placementCells,
} from "./logic";
import { getRandomWordSearch, getTodaysWordSearch } from "./client";
import "./WordSearch.css";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; puzzle: WordSearchPuzzle; storageId: string };

function foundKey(storageId: string): string {
  return `cards.wordsearch.found.${storageId}`;
}

function loadFound(storageId: string, words: string[]): string[] {
  try {
    const raw = localStorage.getItem(foundKey(storageId));
    if (!raw) return [];
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? arr.filter((w) => words.includes(w)) : [];
  } catch {
    return [];
  }
}

function saveFound(storageId: string, found: string[]): void {
  try {
    localStorage.setItem(foundKey(storageId), JSON.stringify(found));
  } catch {
    /* non-fatal */
  }
}

export default function WordSearchScreen() {
  const profile = useProfile();
  const difficulty = profile.settings.wordsearchDifficulty;

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

  const [practiceSeed, setPracticeSeed] = useState<number | null>(null);
  const isPractice = practiceSeed !== null;

  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [found, setFound] = useState<string[]>([]);
  // The in-progress drag selection as cell indices (null when not dragging).
  const [selection, setSelection] = useState<number[] | null>(null);
  const dragStart = useRef<{ row: number; col: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const puzzle = load.status === "ready" ? load.puzzle : null;
  const storageId = load.status === "ready" ? load.storageId : "loading";
  const loadedPracticeSeed = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apply = (p: WordSearchPuzzle, sid: string) => {
      if (cancelled) return;
      setLoad({ status: "ready", puzzle: p, storageId: sid });
      setFound(isPractice ? [] : loadFound(sid, p.words));
      setSelection(null);
    };

    if (isPractice) {
      if (loadedPracticeSeed.current === practiceSeed) return;
      loadedPracticeSeed.current = practiceSeed;
      setLoad({ status: "loading" });
      (async () => {
        const p = await getRandomWordSearch(difficulty);
        if (cancelled) return;
        if (p) apply(p, `practice-${practiceSeed}-${difficulty}`);
        else setLoad({ status: "error" });
      })();
    } else {
      loadedPracticeSeed.current = null;
      setLoad({ status: "loading" });
      (async () => {
        const res = await getTodaysWordSearch(difficulty);
        if (cancelled) return;
        if (res) apply(res.puzzle, `daily-${res.date}-${difficulty}`);
        else setLoad({ status: "error" });
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [isPractice, practiceSeed, difficulty, dayKey]);

  const solved = !!puzzle && found.length === puzzle.words.length;

  // Found words as line segments (in viewBox units: 1 per cell, centered on
  // cells) for the rounded capsule overlay.
  const foundLines = useMemo(() => {
    if (!puzzle) return [] as { word: string; x1: number; y1: number; x2: number; y2: number }[];
    const lines: { word: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const w of found) {
      const cells = placementCells(puzzle, w);
      if (cells.length === 0) continue;
      const first = cells[0];
      const last = cells[cells.length - 1];
      const center = (idx: number) => ({
        x: (idx % puzzle.size) + 0.5,
        y: Math.floor(idx / puzzle.size) + 0.5,
      });
      const a = center(first);
      const b = center(last);
      lines.push({ word: w, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    return lines;
  }, [puzzle, found]);

  const selectionSet = useMemo(
    () => new Set(selection ?? []),
    [selection],
  );

  // Resolve a pointer position to a grid cell {row, col}, or null if outside.
  const cellFromPoint = useCallback(
    (clientX: number, clientY: number): { row: number; col: number } | null => {
      const grid = gridRef.current;
      if (!grid || !puzzle) return null;
      const rect = grid.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
      const col = Math.floor((x / rect.width) * puzzle.size);
      const row = Math.floor((y / rect.height) * puzzle.size);
      if (row < 0 || row >= puzzle.size || col < 0 || col >= puzzle.size)
        return null;
      return { row, col };
    },
    [puzzle],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (solved || !puzzle) return;
      const cell = cellFromPoint(e.clientX, e.clientY);
      if (!cell) return;
      e.preventDefault();
      gridRef.current?.setPointerCapture(e.pointerId);
      dragStart.current = cell;
      setSelection([cell.row * puzzle.size + cell.col]);
    },
    [solved, puzzle, cellFromPoint],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStart.current || !puzzle) return;
      const cell = cellFromPoint(e.clientX, e.clientY);
      if (!cell) return;
      const line = lineBetween(puzzle.size, dragStart.current, cell);
      // Only update when the end cell forms a valid straight line; otherwise
      // keep the last valid selection so a wobbly drag doesn't clear it.
      if (line) setSelection(line);
    },
    [puzzle, cellFromPoint],
  );

  const finishSelection = useCallback(() => {
    if (!puzzle || !selection) {
      dragStart.current = null;
      setSelection(null);
      return;
    }
    const foundSet = new Set(found);
    const word = matchWord(puzzle, selection, foundSet);
    if (word) {
      const nextFound = [...found, word];
      setFound(nextFound);
      if (!isPractice) {
        saveFound(storageId, nextFound);
        if (nextFound.length === puzzle.words.length) {
          recordWordSearchComplete(dayNumberForKey(todayKey()));
        }
      }
    }
    dragStart.current = null;
    setSelection(null);
  }, [puzzle, selection, found, isPractice, storageId]);

  const startPractice = useCallback(() => {
    setFound([]);
    setSelection(null);
    setPracticeSeed((n) => (n ?? 0) + 1);
  }, []);
  const exitPractice = useCallback(() => {
    setFound([]);
    setSelection(null);
    setPracticeSeed(null);
  }, []);

  const setDifficulty = useCallback((d: WordSearchDifficulty) => {
    updateSettings({ wordsearchDifficulty: d });
  }, []);

  const dateLabel = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const title = isPractice ? "Practice Word Search" : "Daily Word Search";

  if (load.status !== "ready" || !puzzle) {
    return (
      <div className="wordsearch">
        <header className="app-bar">
          <Link to="/" className="icon-btn" aria-label="Back to menu">
            ←
          </Link>
          <h1>{title}</h1>
        </header>
        <div className="ws-status">
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

  const letters = puzzle.grid.join("").split("");

  return (
    <div className="wordsearch">
      <header className="app-bar">
        <Link to="/" className="icon-btn" aria-label="Back to menu">
          ←
        </Link>
        <h1>{title}</h1>
      </header>

      <div className="ws-body">
        <div className="ws-heading">
          <span className="ws-date">
            {isPractice ? "Practice puzzle" : dateLabel}
          </span>
          <span className="ws-progress">
            {found.length}/{puzzle.words.length} found
          </span>
        </div>

        {/* Difficulty picker (daily only) — bigger grid = harder; any level
            counts for the single streak. */}
        {!isPractice && (
          <div
            className="segmented ws-diff"
            role="group"
            aria-label="Word Search difficulty"
          >
            {(["easy", "medium", "hard"] as WordSearchDifficulty[]).map((d) => (
              <button
                key={d}
                className={`segment ${difficulty === d ? "active" : ""}`}
                aria-pressed={difficulty === d}
                onClick={() => setDifficulty(d)}
              >
                {d === "easy" ? "Easy" : d === "medium" ? "Medium" : "Hard"}
              </button>
            ))}
          </div>
        )}

        <div className="ws-practice-row">
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
          <div className="ws-solved" role="status">
            {isPractice
              ? "All found! Try another practice puzzle."
              : "All found! Come back tomorrow for a new puzzle."}
          </div>
        )}

        <div
          ref={gridRef}
          className="ws-grid"
          style={{
            gridTemplateColumns: `repeat(${puzzle.size}, 1fr)`,
            aspectRatio: "1 / 1",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishSelection}
          onPointerCancel={finishSelection}
        >
          {letters.map((ch, i) => {
            const cls = [
              "ws-cell",
              selectionSet.has(i) ? "selecting" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div key={i} className={cls}>
                {ch}
              </div>
            );
          })}

          {/* Found words drawn as rounded capsule lines. The SVG uses a
              size×size viewBox (one unit per cell), so a line from the center
              of the first cell to the center of the last cell lands exactly on
              the letters — and rounded caps look clean on diagonals. */}
          <svg
            className="ws-lines"
            viewBox={`0 0 ${puzzle.size} ${puzzle.size}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            {foundLines.map((ln) => (
              <line
                key={ln.word}
                x1={ln.x1}
                y1={ln.y1}
                x2={ln.x2}
                y2={ln.y2}
                className="ws-line"
              />
            ))}
          </svg>
        </div>

        <ul className="ws-words">
          {puzzle.words.map((w) => (
            <li
              key={w}
              className={found.includes(w) ? "ws-word found" : "ws-word"}
            >
              {w}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
