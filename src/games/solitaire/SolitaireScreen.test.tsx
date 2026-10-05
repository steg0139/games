import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SolitaireScreen from "./SolitaireScreen";

// Smoke test: the screen mounts, deals a game, and shows its chrome. Catches
// integration regressions (bad imports, hook misuse) cheaply. Full drag/tap
// behavior needs a real browser and isn't covered here.
describe("SolitaireScreen", () => {
  it("renders the board and controls without crashing", () => {
    render(
      <MemoryRouter>
        <SolitaireScreen />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Solitaire" })).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    // The header shows a combined timer · move-count readout, starting at
    // "0:00 · 0" (timer may have ticked to 0:01 by assertion time).
    expect(screen.getByText(/^\d+:\d{2} · 0$/)).toBeInTheDocument();
  });
});
