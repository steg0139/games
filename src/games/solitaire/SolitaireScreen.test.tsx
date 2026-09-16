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
    // Move counter starts at 0.
    expect(screen.getByText("0 moves")).toBeInTheDocument();
  });
});
