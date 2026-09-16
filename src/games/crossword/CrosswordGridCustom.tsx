import { useContext } from "react";
import { CrosswordContext } from "@jaredreisinger/react-crossword";
import type { CellData } from "@jaredreisinger/react-crossword";
import "./CrosswordGridCustom.css";

// The library doesn't export its context type from the package root, so we
// describe just the fields we read here. These match CrosswordContextType.
interface GridContext {
  gridData: CellData[][];
  rows: number;
  cols: number;
  focused: boolean;
  selectedPosition: { row: number; col: number };
  selectedDirection: "across" | "down";
  selectedNumber: string;
  handleCellClick: (cell: CellData) => void;
}

/**
 * A plain HTML/CSS-grid renderer for the crossword, used INSTEAD of the
 * library's <CrosswordGrid /> SVG.
 *
 * Why: react-crossword's SVG has a viewBox but no width/height attributes, so
 * it defaults to ~300px and leaves a large empty gap below the grid on mobile.
 * Its size is set by styled-components in a way our CSS couldn't reliably
 * override. This component uses a real CSS grid that fills the available width
 * and keeps square cells, while consuming the SAME CrosswordContext — so all
 * of the library's selection/typing/check/reveal logic is unchanged. We only
 * replace how the grid is drawn.
 */
export default function CrosswordGridCustom() {
  const {
    gridData,
    rows,
    cols,
    focused,
    selectedPosition,
    selectedDirection,
    selectedNumber,
    handleCellClick,
  } = useContext(CrosswordContext) as unknown as GridContext;

  if (!gridData || rows === 0 || cols === 0) return null;

  return (
    <div
      className="cwc-grid"
      style={{
        // A cell per column; the wrapper's aspect-ratio keeps them square.
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        aspectRatio: `${cols} / ${rows}`,
      }}
      role="grid"
      aria-label="Crossword grid"
    >
      {gridData.flatMap((rowData, row) =>
        rowData.map((cell: CellData, col) => {
          if (!cell.used) {
            return (
              <div
                key={`R${row}C${col}`}
                className="cwc-cell cwc-cell-blank"
                aria-hidden="true"
              />
            );
          }

          const isFocused =
            focused &&
            row === selectedPosition.row &&
            col === selectedPosition.col;
          const isHighlighted =
            focused &&
            !!selectedNumber &&
            cell[selectedDirection] === selectedNumber;

          const cls =
            "cwc-cell cwc-cell-used" +
            (isHighlighted ? " cwc-cell-highlight" : "") +
            (isFocused ? " cwc-cell-focus" : "");

          return (
            <div
              key={`R${row}C${col}`}
              className={cls}
              role="gridcell"
              onClick={() => handleCellClick(cell)}
            >
              {cell.number && <span className="cwc-number">{cell.number}</span>}
              <span className="cwc-guess">{cell.guess ?? ""}</span>
            </div>
          );
        }),
      )}
    </div>
  );
}
