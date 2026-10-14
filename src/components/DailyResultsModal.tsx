import { useEffect, useRef } from "react";
import DailyLeaderboard from "./DailyLeaderboard";
import type { DailyBoardKey } from "../lib/stats/daily-compete";
import "./DailyResultsModal.css";

interface Props {
  board: DailyBoardKey;
  /** Show the hints column (sudoku only). */
  showHints?: boolean;
  /** Optimistic local result for this device (shown before sync completes). */
  myResult?: { timeSeconds: number; hints: number } | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Modal wrapper around the daily standings. Opens over the game screen (e.g.
 * auto-opened on solve, or reopened via the "Results" button). Dismisses on
 * backdrop tap, the close button, or Escape. The standings inside keep
 * auto-refreshing while the modal is mounted.
 */
export default function DailyResultsModal({
  board,
  showHints = false,
  myResult = null,
  open,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Move focus into the dialog when it opens (basic a11y).
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="results-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="results-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Daily results"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="results-close"
          onClick={onClose}
          aria-label="Close results"
        >
          ✕
        </button>
        <DailyLeaderboard board={board} showHints={showHints} myResult={myResult} />
      </div>
    </div>
  );
}
