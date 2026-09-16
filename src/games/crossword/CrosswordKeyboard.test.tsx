import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CrosswordContext } from "@jaredreisinger/react-crossword";
import CrosswordKeyboard, { type Selection } from "./CrosswordKeyboard";

// Render the keyboard inside a mocked crossword context so we can assert it
// dispatches the right key events to the library's input handler.
function renderWithContext(handleInputKeyDown: (e: unknown) => void) {
  const selectionRef = { current: null as Selection | null };
  const ctxValue = {
    handleInputKeyDown,
    selectedPosition: { row: 0, col: 0 },
    focused: true,
  } as unknown as React.ContextType<typeof CrosswordContext>;
  render(
    <CrosswordContext.Provider value={ctxValue}>
      <CrosswordKeyboard selectionRef={selectionRef} />
    </CrosswordContext.Provider>,
  );
  return selectionRef;
}

describe("CrosswordKeyboard", () => {
  it("dispatches a letter key to handleInputKeyDown", () => {
    const handler = vi.fn();
    renderWithContext(handler);
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].key).toBe("A");
  });

  it("dispatches Backspace from the delete key", () => {
    const handler = vi.fn();
    renderWithContext(handler);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(handler.mock.calls[0][0].key).toBe("Backspace");
  });

  it("mirrors the focused cell into selectionRef", () => {
    const handler = vi.fn();
    const selectionRef = renderWithContext(handler);
    expect(selectionRef.current).toEqual({ row: 0, col: 0 });
  });
});
