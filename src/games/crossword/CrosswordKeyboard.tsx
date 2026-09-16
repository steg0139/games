import {
  type MutableRefObject,
  useCallback,
  useContext,
  useEffect,
} from "react";
import { CrosswordContext } from "@jaredreisinger/react-crossword";
import "./CrosswordKeyboard.css";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export interface Selection {
  row: number;
  col: number;
}

export interface ActiveClue {
  direction: "across" | "down";
  number: string;
  text: string;
}

/**
 * Custom on-screen keyboard that drives react-crossword through its context's
 * `handleInputKeyDown`. Using our own keyboard means the OS keyboard never
 * opens — no password/credit-card/location autofill prompts, and nothing can
 * cover the grid or clue bar.
 */
interface ClueEntry {
  number: string;
  clue: string;
}

export default function CrosswordKeyboard({
  selectionRef,
  onActiveClue,
}: {
  // Kept updated with the currently focused cell so the parent's Reveal can
  // target it.
  selectionRef: MutableRefObject<Selection | null>;
  // Reports the clue for the currently selected cell (updates on every cell
  // tap / arrow move — react-crossword's onClueSelected only fires on clue-list
  // clicks, so we derive it from context instead).
  onActiveClue: (clue: ActiveClue | null) => void;
}) {
  const ctx = useContext(CrosswordContext) as unknown as {
    handleInputKeyDown: (e: {
      key: string;
      preventDefault: () => void;
      stopPropagation: () => void;
    }) => void;
    selectedPosition?: { row: number; col: number };
    selectedDirection?: "across" | "down";
    selectedNumber?: string;
    focused?: boolean;
    clues?: { across: ClueEntry[]; down: ClueEntry[] };
  };

  // Mirror the focused cell into the ref for the parent's Reveal button.
  useEffect(() => {
    const pos = ctx.selectedPosition;
    selectionRef.current =
      ctx.focused && pos && pos.row >= 0 && pos.col >= 0
        ? { row: pos.row, col: pos.col }
        : selectionRef.current;
  }, [ctx.selectedPosition, ctx.focused, selectionRef]);

  // Report the active clue for the current selection (cell taps + moves).
  useEffect(() => {
    const dir = ctx.selectedDirection;
    const num = ctx.selectedNumber;
    if (!ctx.focused || !dir || !num || !ctx.clues) {
      onActiveClue(null);
      return;
    }
    const entry = ctx.clues[dir]?.find((c) => c.number === num);
    onActiveClue(entry ? { direction: dir, number: num, text: entry.clue } : null);
  }, [ctx.selectedDirection, ctx.selectedNumber, ctx.focused, ctx.clues, onActiveClue]);

  // Note: there's no native/OS keyboard to suppress anymore — the custom grid
  // (CrosswordGridCustom) renders no <input>, so mobile browsers never pop
  // their own keyboard or autofill. Typing flows entirely through this
  // component's press() → ctx.handleInputKeyDown.

  const press = useCallback(
    (key: string) => {
      ctx.handleInputKeyDown?.({
        key,
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    },
    [ctx],
  );

  return (
    <div className="cw-keyboard" role="group" aria-label="On-screen keyboard">
      {ROWS.map((row, i) => (
        <div className="cw-kb-row" key={i}>
          {i === 2 && (
            <button
              className="cw-key cw-key-wide"
              onClick={() => press("Backspace")}
              aria-label="Delete"
            >
              ⌫
            </button>
          )}
          {row.split("").map((k) => (
            <button key={k} className="cw-key" onClick={() => press(k)}>
              {k}
            </button>
          ))}
          {i === 2 && (
            <button
              className="cw-key cw-key-wide"
              onClick={() => press("ArrowRight")}
              aria-label="Next cell"
            >
              →
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
