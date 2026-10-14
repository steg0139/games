import { describe, expect, it } from "vitest";
import {
  type Profile,
  PROFILE_VERSION,
  defaultProfile,
  generateFriendCode,
  mergeProfiles,
  normalizeFriendCode,
  toPublicProfile,
} from "./types";

describe("generateFriendCode", () => {
  it("produces an XXXX-XXXX code from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateFriendCode();
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
      // Never contains the easily-confused characters we deliberately dropped.
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it("round-trips through normalizeFriendCode unchanged", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateFriendCode();
      expect(normalizeFriendCode(code)).toBe(code);
    }
  });
});

describe("normalizeFriendCode", () => {
  it("uppercases, strips spaces, and inserts the dash", () => {
    expect(normalizeFriendCode("7xk92mh4")).toBe("7XK9-2MH4");
    expect(normalizeFriendCode("7xk9-2mh4")).toBe("7XK9-2MH4");
    expect(normalizeFriendCode("  7XK9 2MH4 ")).toBe("7XK9-2MH4");
  });

  it("rejects wrong length and ambiguous/invalid characters", () => {
    expect(normalizeFriendCode("")).toBeNull();
    expect(normalizeFriendCode("ABC")).toBeNull();
    expect(normalizeFriendCode("ABCDE-FGHIJ")).toBeNull(); // 10 chars
    expect(normalizeFriendCode("0OIL1234")).toBeNull(); // ambiguous chars not in alphabet
    expect(normalizeFriendCode("ABCD-123!")).toBeNull();
  });
});

describe("mergeProfiles", () => {
  const base = (patch: Partial<Profile>): Profile => ({
    ...defaultProfile(),
    ...patch,
  });

  it("keeps the more recently updated profile wholesale", () => {
    const older = base({ updatedAt: 100, displayName: "Old" });
    const newer = base({ updatedAt: 200, displayName: "New" });
    expect(mergeProfiles(older, newer).displayName).toBe("New");
    expect(mergeProfiles(newer, older).displayName).toBe("New");
  });

  it("prefers the first argument on a tie", () => {
    const a = base({ updatedAt: 100, displayName: "A" });
    const b = base({ updatedAt: 100, displayName: "B" });
    expect(mergeProfiles(a, b).displayName).toBe("A");
  });

  it("preserves a friend code even when the winner has none", () => {
    const winner = base({ updatedAt: 200, friendCode: "" });
    const loser = base({ updatedAt: 100, friendCode: "7XK9-2MH4" });
    expect(mergeProfiles(winner, loser).friendCode).toBe("7XK9-2MH4");
  });

  it("keeps the winner's friend code when it has one", () => {
    const winner = base({ updatedAt: 200, friendCode: "AAAA-BBBB" });
    const loser = base({ updatedAt: 100, friendCode: "7XK9-2MH4" });
    expect(mergeProfiles(winner, loser).friendCode).toBe("AAAA-BBBB");
  });
});

describe("toPublicProfile", () => {
  it("copies display name, code, and comparable stats but no device-identifying data", () => {
    const p = defaultProfile();
    p.displayName = "Jo";
    p.friendCode = "7XK9-2MH4";
    p.updatedAt = 42;
    p.blackjack.bestBankroll = 999;

    const pub = toPublicProfile(p);
    expect(pub.code).toBe("7XK9-2MH4");
    expect(pub.displayName).toBe("Jo");
    expect(pub.updatedAt).toBe(42);
    expect(pub.blackjack.bestBankroll).toBe(999);
    // Settings and friends are intentionally not part of the public view.
    expect(pub).not.toHaveProperty("settings");
    expect(pub).not.toHaveProperty("friends");
  });
});

describe("defaultProfile", () => {
  it("has the current version and all social fields initialized", () => {
    const p = defaultProfile();
    expect(p.version).toBe(PROFILE_VERSION);
    expect(p.displayName).toBe("");
    expect(p.friendCode).toBe("");
    expect(p.friends).toEqual([]);
    expect(p.solitaire.hintsUsed).toBe(0);
    expect(p.sudoku.hintsUsed).toBe(0);
    expect(p.sudoku.bestTimeSeconds).toBeNull();
    expect(p.crossword.bestTimeSeconds).toBeNull();
    expect(p.wordsearch.bestTimeSeconds).toBeNull();
    expect(p.blackjack.biggestBet).toBe(0);
    expect(p.blackjack.biggestWin).toBe(0);
    expect(p.videopoker.biggestBet).toBe(0);
  });
});
