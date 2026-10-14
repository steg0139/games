// Generate a WORD-SEARCH-ONLY long-word list (8-12 letters).
//
//   node scripts/generate-wordsearch-words.mjs
//
// Word search doesn't need clues — just valid, familiar single words — so this
// list isn't built with clues like the crossword pool. Candidates come from
// Spread the Word(list) (CC BY-NC-SA 4.0, https://www.spreadthewordlist.com),
// but STWL's long entries include a lot of smashed-together phrases
// (ISTHISATRICK, DASHOFPEPPER) and junk (BATHOILS), so we validate each against
// WordNet and keep only real single-lemma words, dropping proper nouns and
// acronyms. The result merges into the word-search pool at runtime so
// medium/hard can occasionally surface longer words. The shared crossword pool
// stays 3-8 letters and is untouched.
//
// Attribution for STWL is already shown in-app on the Stats & Settings screen.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import wordnet from "wordnet";
import { isBlockedWord } from "./word-blocklist.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const STWL_URL =
  "https://www.spreadthewordlist.com/downloads/spreadthewordlist_caps.txt";
// Long words top out around a score of 55 in STWL; keep the clean tier.
const MIN_SCORE = 50;
const MIN_LEN = 8;
const MAX_LEN = 12;

/** Drop words WordNet only knows as a proper noun or acronym (capitalized/
 *  uppercased in every sense). Mirrors the crossword pool's filter. */
function isProperOrAcronym(defs, answer) {
  const lc = answer.toLowerCase();
  let sawAnswer = false;
  for (const d of defs) {
    for (const wObj of d.meta?.words ?? []) {
      const bare = String(wObj.word)
        .replace(/\(.*\)/g, "")
        .replace(/_/g, " ")
        .trim();
      if (bare.toLowerCase() !== lc) continue;
      sawAnswer = true;
      if (bare === bare.toLowerCase()) return false;
    }
  }
  return sawAnswer;
}

async function main() {
  const resp = await fetch(STWL_URL);
  if (!resp.ok) throw new Error(`STWL fetch failed: ${resp.status}`);

  const lenRe = new RegExp(`^[a-z]{${MIN_LEN},${MAX_LEN}}$`);
  const scored = new Map(); // word -> best score
  for (const line of (await resp.text()).split("\n")) {
    const semi = line.lastIndexOf(";");
    if (semi < 0) continue;
    const word = line.slice(0, semi).trim().toLowerCase();
    const score = parseInt(line.slice(semi + 1), 10);
    if (!lenRe.test(word)) continue;
    if (!Number.isFinite(score) || score < MIN_SCORE) continue;
    if (isBlockedWord(word)) continue;
    scored.set(word, Math.max(scored.get(word) ?? 0, score));
  }
  console.log(`STWL ${MIN_LEN}-${MAX_LEN} single-token candidates (score>=${MIN_SCORE}): ${scored.size}`);

  await wordnet.init();

  // Keep only real single-lemma WordNet words that aren't proper/acronyms.
  const kept = [];
  for (const [word] of scored) {
    let defs;
    try {
      defs = await wordnet.lookup(word);
    } catch {
      continue; // not a real dictionary word (drops smashed phrases/junk)
    }
    if (!defs || defs.length === 0) continue;
    if (isProperOrAcronym(defs, word)) continue;
    kept.push(word.toUpperCase());
  }

  kept.sort((a, b) => a.length - b.length || a.localeCompare(b));

  const byLen = {};
  for (const w of kept) byLen[w.length] = (byLen[w.length] ?? 0) + 1;

  const out = join(__dirname, "..", "infra", "lambda", "wordsearch-long-words.json");
  writeFileSync(out, JSON.stringify(kept), "utf8");
  console.log(`Wrote ${kept.length} WordNet-validated long words to ${out}`);
  console.log(`  by length: ${JSON.stringify(byLen)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
