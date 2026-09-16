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

/**
 * Custom on-screen keyboard that drives react-crossword through its context's
 * `handleInputKeyDown`. Using our own keyboard means the OS keyboard never
 * opens — no password/credit-card/location autofill prompts, and nothing can
 * cover the grid or clue bar.
 */
export default function CrosswordKeyboard({
  selectionRef,
}: {
  // Kept updated with the currently focused cell so the parent's Reveal can
  // target it.
  selectionRef: MutableRefObject<Selection | null>;
}) {
  const ctx = useContext(CrosswordContext) as unknown as {
    handleInputKeyDown: (e: {
      key: string;
      preventDefault: () => void;
      stopPropagation: () => void;
    }) => void;
    selectedPosition?: { row: number; col: number };
    focused?: boolean;
  };

  // Mirror the focused cell into the ref for the parent's Reveal button.
  useEffect(() => {
    const pos = ctx.selectedPosition;
    selectionRef.current =
      ctx.focused && pos && pos.row >= 0 && pos.col >= 0
        ? { row: pos.row, col: pos.col }
        : selectionRef.current;
  }, [ctx.selectedPosition, ctx.focused, selectionRef]);

  // Suppress the native keyboard: mark the crossword's hidden input so mobile
  // browsers don't pop their own keyboard when it's focused.
  useEffect(() => {
    const suppress = () => {
      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label="crossword-input"]',
      );
      if (input) {
        // inputmode="none" keeps the input focusable (so the library's cell
        // selection still works) but tells the browser not to show its virtual
        // keyboard. autocomplete=off + a neutral name avoid autofill prompts.
        input.setAttribute("inputmode", "none");
        input.setAttribute("autocapitalize", "characters");
        input.setAttribute("autocomplete", "off");
        input.setAttribute("name", "crossword-cell");
      }
    };
    suppress();
    // The input is (re)created as the player moves; keep enforcing it.
    const timer = setInterval(suppress, 500);
    return () => clearInterval(timer);
  }, []);

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
