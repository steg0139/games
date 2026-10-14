import { describe, expect, it } from "vitest";
import { COMPARE_GAMES, rankByStat } from "./compare";
import { type PublicProfile, defaultProfile, toPublicProfile } from "./types";

// Build a PublicProfile with a few overridable stat fields.
function makeProfile(code: string, patch: (p: ReturnType<typeof defaultProfile>) => void): PublicProfile {
  const p = defaultProfile();
  p.friendCode = code;
  p.displayName = code;
  patch(p);
  return toPublicProfile(p);
}

const statById = (game: string, id: string) => {
  const g = COMPARE_GAMES.find((x) => x.id === game)!;
  return g.stats.find((s) => s.id === id)!;
};

describe("COMPARE_GAMES catalog", () => {
  it("covers all six games with at least one stat each", () => {
    expect(COMPARE_GAMES.map((g) => g.id)).toEqual([
      "solitaire",
      "blackjack",
      "videopoker",
      "crossword",
      "sudoku",
      "wordsearch",
    ]);
    for (const g of COMPARE_GAMES) expect(g.stats.length).toBeGreaterThan(0);
  });

  it("has unique stat ids within each game", () => {
    for (const g of COMPARE_GAMES) {
      const ids = g.stats.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("omits cross-difficulty best time for sudoku and word search", () => {
    // Those times merge difficulties, so they aren't comparable here — time
    // racing lives in the per-difficulty daily competition instead.
    for (const game of ["sudoku", "wordsearch"]) {
      const g = COMPARE_GAMES.find((x) => x.id === game)!;
      expect(g.stats.some((s) => s.id === "besttime")).toBe(false);
      expect(g.stats.some((s) => s.id === "streak")).toBe(true);
    }
    // Single-board games keep best time (it's comparable there).
    for (const game of ["solitaire", "crossword"]) {
      const g = COMPARE_GAMES.find((x) => x.id === game)!;
      expect(g.stats.some((s) => s.id === "besttime")).toBe(true);
    }
  });
});

describe("rankByStat", () => {
  it('ranks a "higher is better" stat descending', () => {
    const stat = statById("blackjack", "bankroll");
    const players = [
      makeProfile("a", (p) => (p.blackjack.bestBankroll = 100)),
      makeProfile("b", (p) => (p.blackjack.bestBankroll = 500)),
      makeProfile("c", (p) => (p.blackjack.bestBankroll = 250)),
    ];
    expect(rankByStat(stat, players).map((e) => e.profile.code)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it('ranks a "lower is better" time stat ascending', () => {
    const stat = statById("crossword", "besttime");
    const players = [
      makeProfile("slow", (p) => (p.crossword.bestTimeSeconds = 300)),
      makeProfile("fast", (p) => (p.crossword.bestTimeSeconds = 120)),
    ];
    const ranked = rankByStat(stat, players);
    expect(ranked[0].profile.code).toBe("fast");
    expect(ranked[0].value).toBe("2:00");
  });

  it("sinks players with no data for the stat to the bottom", () => {
    const stat = statById("solitaire", "winrate");
    const players = [
      makeProfile("nodata", () => {}), // 0 games played -> null rank
      makeProfile("has", (p) => {
        p.solitaire.gamesPlayed = 10;
        p.solitaire.gamesWon = 4;
      }),
    ];
    const ranked = rankByStat(stat, players);
    expect(ranked[0].profile.code).toBe("has");
    expect(ranked[0].noData).toBe(false);
    expect(ranked[1].profile.code).toBe("nodata");
    expect(ranked[1].noData).toBe(true);
    expect(ranked[1].value).toBe("—");
  });

  it("is stable for ties and does not mutate the input", () => {
    const stat = statById("crossword", "completed");
    const players = [
      makeProfile("x", (p) => (p.crossword.completed = 5)),
      makeProfile("y", (p) => (p.crossword.completed = 5)),
    ];
    const copy = [...players];
    const ranked = rankByStat(stat, players);
    expect(ranked.map((e) => e.profile.code)).toEqual(["x", "y"]); // input order kept
    expect(players).toEqual(copy); // not mutated
  });
});
