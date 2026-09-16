// Build-time crossword generator.
//   node scripts/generate-crosswords.mjs
// Pulls public-domain WordNet definitions as clues for a curated common-word
// list, assembles NUM_PUZZLES interlocking puzzles via crossword-layout-
// generator, validates them, and writes them to
// src/games/crossword/generated-puzzles.json.
//
// WordNet (Princeton) is used only here at build time; only the generated
// JSON ships in the app. WordNet license: permissive (attribution).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import wordnet from "wordnet";
import clgPkg from "crossword-layout-generator";
import { COMMON_WORDS } from "./words.mjs";

const generateLayout = clgPkg.generateLayout ?? clgPkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const NUM_PUZZLES = 90;
const WORDS_PER_PUZZLE = 16; // aim; a few may not place
const MIN_PLACED = 10; // require at least this many words in the grid
const MAX_CLUE_LEN = 90;

// Deterministic PRNG (mulberry32) so regenerating gives the same puzzles.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turn a WordNet glossary into a concise crossword clue. */
function toClue(glossary, answer) {
  if (!glossary) return null;
  // Take the first sense (before ';'), strip parenthetical/usage notes.
  let clue = glossary.split(";")[0].trim();
  clue = clue.replace(/\([^)]*\)/g, "").replace(/"[^"]*"/g, "").trim();
  clue = clue.replace(/\s+/g, " ");
  if (!clue) return null;
  // Reject clues that give away the answer.
  if (clue.toLowerCase().includes(answer.toLowerCase())) return null;
  if (clue.length > MAX_CLUE_LEN) clue = clue.slice(0, MAX_CLUE_LEN).trim();
  // Capitalize first letter.
  return clue.charAt(0).toUpperCase() + clue.slice(1);
}

async function main() {
  await wordnet.init();

  // Build the pool of {answer, clue} from curated words that have clean clues.
  const pool = [];
  const seen = new Set();
  for (const raw of COMMON_WORDS) {
    const answer = raw.toUpperCase();
    if (seen.has(answer)) continue;
    if (!/^[A-Z]{4,8}$/.test(answer)) continue;
    seen.add(answer);
    let defs;
    try {
      defs = await wordnet.lookup(raw.toLowerCase());
    } catch {
      continue; // not in WordNet
    }
    if (!defs || defs.length === 0) continue;
    let clue = null;
    for (const d of defs) {
      clue = toClue(d.glossary, answer);
      if (clue) break;
    }
    if (!clue) continue;
    pool.push({ answer, clue });
  }

  console.log(`Clue pool: ${pool.length} words with clean clues.`);
  if (pool.length < WORDS_PER_PUZZLE * 2) {
    throw new Error("Not enough usable words to generate varied puzzles.");
  }

  const rand = mulberry32(0x5eed);
  const puzzles = [];
  let attempts = 0;
  const maxAttempts = NUM_PUZZLES * 20;

  while (puzzles.length < NUM_PUZZLES && attempts < maxAttempts) {
    attempts++;
    // Shuffle a copy and take a slice for this puzzle.
    const shuffled = pool.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const words = shuffled.slice(0, WORDS_PER_PUZZLE);

    const layout = generateLayout(
      words.map((w) => ({ clue: w.clue, answer: w.answer })),
    );
    const placed = layout.result.filter((r) => r.orientation !== "none");
    if (placed.length < MIN_PLACED) continue;

    // Keep only the placed words (so the stored puzzle matches the grid).
    puzzles.push({
      words: placed.map((p) => ({ answer: p.answer, clue: p.clue })),
    });
  }

  if (puzzles.length < NUM_PUZZLES) {
    console.warn(
      `Only generated ${puzzles.length}/${NUM_PUZZLES} puzzles (attempts: ${attempts}).`,
    );
  }

  const out = join(__dirname, "..", "src", "games", "crossword", "generated-puzzles.json");
  writeFileSync(out, JSON.stringify(puzzles), "utf8");
  console.log(`Wrote ${puzzles.length} puzzles to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
