import { describe, expect, it } from "vitest";
// The runtime blocklist used by the crossword + word-search Lambdas. Tested
// here (the only place with a test runner) to lock in its behavior.
import {
  isBlockedEntry,
  isBlockedWord,
} from "../../infra/lambda/word-blocklist";

describe("isBlockedWord — blocks intended terms", () => {
  const blocked = [
    "abortion", "devil", "hell", "satan", "witch", "sin", "evil",
    "death", "dead", "slave", "weapon", "kill", "murder", "suicide",
    "sex", "sexual", "porn", "naked", "rape", "lesbian",
    "drug", "wine", "beer", "alcohol", "drunk", "cocaine",
    "gun", "bomb", "nazi", "casino",
  ];
  for (const w of blocked) {
    it(`blocks "${w}"`, () => {
      expect(isBlockedWord(w)).toBe(true);
    });
  }

  it("is case-insensitive", () => {
    expect(isBlockedWord("DEVIL")).toBe(true);
    expect(isBlockedWord("Devil")).toBe(true);
  });

  it("blocks common morphological variants via stemming", () => {
    expect(isBlockedWord("killed")).toBe(true);
    expect(isBlockedWord("killing")).toBe(true);
    expect(isBlockedWord("kills")).toBe(true);
    expect(isBlockedWord("drugs")).toBe(true);
    expect(isBlockedWord("abortions")).toBe(true);
    expect(isBlockedWord("sins")).toBe(true);
  });
});

describe("isBlockedWord — no Scunthorpe false positives", () => {
  // Clean words that merely CONTAIN a blocked substring must NOT be blocked,
  // because matching is whole-word (with stemming), not substring.
  const clean = [
    "grape", // contains "rape"
    "assassin", // contains "ass"
    "assist", "assume", "assembly", "assess", "passage", "class", "grass",
    "glass", "mass", "compass", "embarrass", "cassette", "massive",
    "scrape", // contains "rape"
    "analysis",
    "shell", // contains "hell"
    "hello", // contains "hell"
    "shallow",
    "sinew", "single", "sinus", // contain "sin"
    "winery", "window", "winner", // contain "win"/"wine"? ("wine" blocked)
    "beacon", "beard",
    "gravel", "gravity", "grace", // contain "grave"
    "diesel", "diet", "diary", // contain "die"
    "cocktail", // contains "coca"? not "cocaine" stem
    "gunk", // not "gun" as a word? (gunk != gun) — whole-word safe
  ];
  for (const w of clean) {
    it(`does NOT block "${w}"`, () => {
      expect(isBlockedWord(w)).toBe(false);
    });
  }

  it("ignores empty / non-alpha input", () => {
    expect(isBlockedWord("")).toBe(false);
    expect(isBlockedWord("123")).toBe(false);
  });
});

describe("isBlockedEntry — answer or clue", () => {
  it("blocks when the answer is blocked", () => {
    expect(isBlockedEntry("DEVIL", "A mischievous imp")).toBe(true);
  });

  it("blocks when a whole word in the clue is blocked", () => {
    // Clean answer, but the clue mentions a blocked word.
    expect(isBlockedEntry("VISION", "He had a ___ of his own death")).toBe(true);
    expect(isBlockedEntry("MATCH", "Lucifer")).toBe(true);
  });

  it("allows a clean answer with a clean clue", () => {
    expect(isBlockedEntry("HELLO", "A friendly greeting")).toBe(false);
    expect(isBlockedEntry("GRAPE", "A small round fruit")).toBe(false);
  });

  it("does not block on a substring inside a clue word", () => {
    // "therapist" contains "rapist" but is a single clean token.
    expect(isBlockedEntry("CouCH", "Seat for a therapist's patient")).toBe(false);
  });
});
