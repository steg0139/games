// Build a curated {answer, clue} pool for the crossword generator Lambda.
//   node scripts/generate-word-pool.mjs
// Pulls public-domain WordNet definitions (build-time only) for the curated
// common-word list and writes infra/lambda/word-pool.json. The Lambda bundles
// this small JSON instead of shipping all of WordNet.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import wordnet from "wordnet";
import { COMMON_WORDS } from "./words.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_CLUE_LEN = 90;

function toClue(glossary, answer) {
  if (!glossary) return null;
  let clue = glossary.split(";")[0].trim();
  clue = clue.replace(/\([^)]*\)/g, "").replace(/"[^"]*"/g, "").trim();
  clue = clue.replace(/\s+/g, " ");
  if (!clue) return null;
  if (clue.toLowerCase().includes(answer.toLowerCase())) return null;
  if (clue.length > MAX_CLUE_LEN) clue = clue.slice(0, MAX_CLUE_LEN).trim();
  return clue.charAt(0).toUpperCase() + clue.slice(1);
}

async function main() {
  await wordnet.init();
  const pool = [];
  const seen = new Set();
  for (const raw of COMMON_WORDS) {
    const answer = raw.toUpperCase();
    if (seen.has(answer) || !/^[A-Z]{4,8}$/.test(answer)) continue;
    seen.add(answer);
    let defs;
    try {
      defs = await wordnet.lookup(raw.toLowerCase());
    } catch {
      continue;
    }
    if (!defs || defs.length === 0) continue;
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
