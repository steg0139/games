import { useEffect, useRef, useState } from "react";

// A live play timer shared by the puzzle games. It counts *active* seconds —
// it pauses while the tab/app is backgrounded (document.hidden) so time away
// doesn't inflate the clock — and persists elapsed per `key` so leaving and
// returning (or a reload) resumes from where you left off.
//
// Usage:
//   const seconds = useGameTimer(storageId, running);
//   <span>{formatClock(seconds)}</span>
// where `running` is true while the game is in progress (false once solved,
// while loading, or on the error screen). Pass a stable `key` per puzzle
// instance (the screens' storageId) so each day/difficulty/practice session
// keeps its own elapsed. Pass key = null to disable persistence (nothing is
// read or written; the timer still ticks in memory).

const PREFIX = "cards.timer.";

function readElapsed(key: string | null): number {
  if (!key) return 0;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeElapsed(key: string | null, seconds: number): void {
  if (!key) return;
  try {
    localStorage.setItem(PREFIX + key, String(seconds));
  } catch {
    /* storage full/unavailable — non-fatal */
  }
}

/** Format whole seconds as m:ss (or h:mm:ss past an hour). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

/**
 * Returns the elapsed active play time in whole seconds, ticking ~once a
 * second while `running` and the document is visible.
 *
 * - `key`: a stable id for this puzzle instance; elapsed is persisted under it
 *   so reload/resume continues. null disables persistence.
 * - `running`: whether the clock should advance (false = paused/stopped).
 */
export function useGameTimer(key: string | null, running: boolean): number {
  // Seconds already banked for this key (loaded from storage on key change).
  const bankedRef = useRef(0);
  // Wall-clock ms when the current active run segment started (null = paused).
  const segmentStartRef = useRef<number | null>(null);
  const [display, setDisplay] = useState(0);

  // Reset to the persisted baseline whenever the key changes.
  useEffect(() => {
    bankedRef.current = readElapsed(key);
    segmentStartRef.current = null;
    setDisplay(bankedRef.current);
  }, [key]);

  useEffect(() => {
    // Compute current elapsed = banked + (now - segmentStart if active).
    const current = () => {
      const seg =
        segmentStartRef.current !== null
          ? Math.floor((Date.now() - segmentStartRef.current) / 1000)
          : 0;
      return bankedRef.current + seg;
    };

    // Fold the active segment back into the bank and stop the segment.
    const bank = () => {
      if (segmentStartRef.current !== null) {
        bankedRef.current = current();
        segmentStartRef.current = null;
        writeElapsed(key, bankedRef.current);
      }
    };

    const active = () => running && !document.hidden;

    // Start or stop a run segment to match the current active state.
    const sync = () => {
      if (active()) {
        if (segmentStartRef.current === null) segmentStartRef.current = Date.now();
      } else {
        bank();
      }
      setDisplay(current());
    };

    sync();

    const tick = setInterval(() => {
      if (active()) {
        const now = current();
        setDisplay(now);
        writeElapsed(key, now); // persist roughly once a second
      }
    }, 1000);

    const onVisibility = () => sync();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("blur", onVisibility);
    // Bank on unmount / tab close so we don't lose the in-flight segment.
    window.addEventListener("pagehide", bank);

    return () => {
      bank();
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("blur", onVisibility);
      window.removeEventListener("pagehide", bank);
    };
  }, [key, running]);

  return display;
}
