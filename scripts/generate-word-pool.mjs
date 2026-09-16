// Build a large {answer, clue} pool for the crossword generator Lambda.
//   node scripts/generate-word-pool.mjs
// Uses a public-domain frequency-ranked common-word list (google-10000-english)
// as candidates, keeps 4–8 letter words that have a clean WordNet definition
// (public domain), and writes infra/lambda/word-pool.json. WordNet + the list
// are build-time only; only the small JSON ships in the Lambda.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import wordnet from "wordnet";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_CLUE_LEN = 90;
const WORD_LIST_URL =
  "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt";

function toClue(glossary, answer) {
  if (!glossary) return null;
  let clue = glossary.split(";")[0].trim();
  clue = clue.replace(/\([^)]*\)/g, "").replace(/"[^"]*"/g, "").trim();
  clue = clue.replace(/\s+/g, " ");
  if (!clue) return null;
  const lc = clue.toLowerCase();
  // Reject clues that give away the answer (or share its stem).
  if (lc.includes(answer.toLowerCase())) return null;
  if (clue.length > MAX_CLUE_LEN) {
    // Trim at the last word boundary within the cap (no mid-word cutoffs).
    const cut = clue.slice(0, MAX_CLUE_LEN);
    clue = cut.slice(0, cut.lastIndexOf(" ")).trim() || cut.trim();
  }
  return clue.charAt(0).toUpperCase() + clue.slice(1);
}

async function main() {
  const resp = await fetch(WORD_LIST_URL);
  if (!resp.ok) throw new Error(`word list fetch failed: ${resp.status}`);
  const candidates = (await resp.text())
    .split("\n")
    .map((w) => w.trim().toLowerCase())
    .filter((w) => /^[a-z]{4,8}$/.test(w));

  await wordnet.init();

  const pool = [];
  const seen = new Set();
  for (const raw of candidates) {
    const answer = raw.toUpperCase();
    if (seen.has(answer)) continue;
    seen.add(answer);
    let defs;
    try {
      defs = await wordnet.lookup(raw);
    } catch {
      continue; // not in WordNet
    }
    if (!defs || defs.length === 0) continue;
    // Prefer a noun/adjective gloss (they read best as crossword clues).
    let clue = null;
    for (const d of defs) {
      clue = toClue(d.glossary, answer);
      if (clue) break;
    }
    if (clue) pool.push({ answer, clue });
  }

  const out = join(__dirname, "..", "infra", "lambda", "word-pool.json");
  writeFileSync(out, JSON.stringify(pool), "utf8");
  console.log(`Wrote ${pool.length} words to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
