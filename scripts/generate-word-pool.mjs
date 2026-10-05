// Build a large {answer, clue} pool for the crossword generator Lambda.
//   node scripts/generate-word-pool.mjs
// Uses a public-domain frequency-ranked common-word list (google-10000-english)
// as candidates, keeps 4–8 letter words that have a clean WordNet entry
// (public domain), and writes infra/lambda/word-pool.json. WordNet + the list
// are build-time only; only the small JSON ships in the Lambda.
//
// Clue quality matters: dictionary glosses read as vague, over-long academic
// definitions (and got truncated mid-sentence), which made puzzles unsolvable.
// We instead build short, crossword-style clues, preferring in order:
//   1. a one-word SYNONYM from the same WordNet synset (e.g. "Speedy" -> QUICK)
//   2. a SHORT gloss (first clause only), and only if it fits without trimming
// If a word has neither, it's DROPPED — we do not fall back to a
// fill-in-the-blank from a WordNet example, because those are almost never
// famous phrases and read as unsolvable ("___ payments"). A smaller pool of
// fair clues beats a large one with impossible clues.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import wordnet from "wordnet";
import { isBlockedEntry, isBlockedWord } from "./word-blocklist.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Clues must comfortably fit the on-screen clue bar on a phone without
// wrapping to more than ~2 lines. Keep them short.
const MAX_CLUE_LEN = 60;
const MIN_CLUE_LEN = 3;

const WORD_LIST_URL =
  "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt";

/** Normalize a WordNet word token: "to_a_greater_extent" -> "to a greater extent". */
function normalizeToken(tok) {
  return tok.replace(/\(.*\)/g, "").replace(/_/g, " ").trim();
}

/** Strip a common inflectional/derivational suffix to a rough root, so
 *  work/working/worked, store/storage/storing, list/listed all collapse. */
function stem(w) {
  let s = w.toLowerCase();
  // Order matters: strip longer suffixes first.
  s = s.replace(/(ations?| ments?|nesses|ingly)$/i, "");
  s = s.replace(/(ings?|ers?|eds?|ions?|ments?| ness|ages?|ies|ic|ly|al|s)$/i, "");
  // Normalize a trailing doubled consonant (running -> runn -> run) and a
  // dropped 'e' (storage -> storag -> store-ish). Keep it rough.
  s = s.replace(/(.)\1$/, "$1");
  return s;
}

/**
 * Share a stem? Guards against a clue giving away its answer via a
 * morphological variant (quickly/QUICK, worked/WORKING, storing/STORAGE).
 * Uses suffix-stripped roots so genuinely different words that merely share a
 * prefix (central/CENTRE, Britain/BRITISH) are NOT treated as the same stem.
 */
function sharesStem(a, b) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return true;
  const rx = stem(x);
  const ry = stem(y);
  if (rx.length < 3 || ry.length < 3) return x === y;
  // Same root, or one root is the other with a short morphological tail.
  if (rx === ry) return true;
  const [shortR, longR] = rx.length <= ry.length ? [rx, ry] : [ry, rx];
  return longR.startsWith(shortR) && longR.length - shortR.length <= 2;
}

function titleCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function clean(s) {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * A single-word synonym clue from the synset's other words. Returns the best
 * (shortest, single-word) usable synonym, or null.
 *
 * Adverb senses are skipped: their "synonyms" are the worst as clues (e.g.
 * CLEAN's adverb sense offers "plum/plumb" meaning "completely"). Nouns, verbs,
 * and adjectives (incl. "adjective satellite") are allowed.
 */
function synonymClue(def, answer) {
  const type = def.meta?.synsetType ?? "";
  if (/adverb/.test(type)) return null;
  const words = def.meta?.words ?? [];
  const candidates = words
    .map((w) => normalizeToken(w.word))
    .filter((w) => w && /^[a-zA-Z][a-zA-Z ]*$/.test(w))
    // Reject if ANY word in the (possibly multiword) synonym shares the
    // answer's stem — otherwise phrases like "free people" leak FREE.
    .filter((w) => !w.split(" ").some((part) => sharesStem(part, answer)))
    // Prefer a single word; allow a short two-word phrase as a fallback.
    .sort((a, b) => a.split(" ").length - b.split(" ").length || a.length - b.length);
  const pick = candidates[0];
  if (!pick) return null;
  if (pick.length < MIN_CLUE_LEN || pick.length > MAX_CLUE_LEN) return null;
  return titleCase(pick);
}

/**
 * A short definition clue: the first clause of the gloss (before the first
 * semicolon), with parentheticals and quoted examples removed. Rejected if it
 * still doesn't fit — we never truncate mid-sentence.
 */
function glossClue(glossary, answer) {
  let clue = glossary.split(";")[0];
  clue = clean(clue.replace(/\([^)]*\)/g, "").replace(/"[^"]*"/g, ""));
  if (!clue) return null;
  if (clue.toLowerCase().includes(answer.toLowerCase())) return null;
  if (clue.length < MIN_CLUE_LEN || clue.length > MAX_CLUE_LEN) return null;
  // Avoid clues that are themselves a cross-reference ("see also...").
  if (/^(see|cf|compare|synonym)/i.test(clue)) return null;
  return titleCase(clue);
}

/**
 * True if any word in the clue gives away the answer by sharing its stem
 * (e.g. "worked" cluing WORKING, "storing" cluing STORAGE, "On a list" cluing
 * LISTED). The ___ blank in fill-in clues is exempt — it's where the answer
 * was removed. Applied as a final gate to every clue, regardless of source.
 */
function clueLeaksAnswer(clue, answer) {
  const tokens = clue.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return tokens.some((t) => t.length >= 3 && sharesStem(t, answer));
}

/** A clue is acceptable if it exists and doesn't leak the answer's stem. */
function usable(clue, answer) {
  return clue && !clueLeaksAnswer(clue, answer) ? clue : null;
}

/**
 * Pick the best clue for an answer across ALL of its WordNet senses, in strict
 * quality tiers:
 *   1. a one-word (or short-phrase) SYNONYM from any sense  — e.g. "Acquire"
 *   2. a short DEFINITION (first gloss clause) from any sense
 * If neither exists, we return null and the word is DROPPED from the pool —
 * we no longer fall back to a fill-in-the-blank. WordNet's example sentences
 * are almost never famous phrases, so blanks like "___ payments" (MONTHLY) or
 * "The ___ party" (ROYAL) are unsolvable; a smaller pool of fair clues beats a
 * larger one with impossible clues. `defs` should be ordered best-sense-first.
 * Returns { clue, kind } or null.
 */
function bestClue(defs, answer) {
  // Tier 1: synonyms.
  for (const d of defs) {
    const c = usable(synonymClue(d, answer), answer);
    if (c) return { clue: c, kind: "synonym" };
  }
  // Tier 2: short definitions.
  for (const d of defs) {
    const c = usable(glossClue(d.glossary ?? "", answer), answer);
    if (c) return { clue: c, kind: "gloss" };
  }
  return null;
}

async function main() {
  const resp = await fetch(WORD_LIST_URL);
  if (!resp.ok) throw new Error(`word list fetch failed: ${resp.status}`);
  const candidates = (await resp.text())
    .split("\n")
    .map((w) => w.trim().toLowerCase())
    .filter((w) => /^[a-z]{4,8}$/.test(w))
    // Drop blocked answer words up front (profanity, slurs, sexual/violent,
    // drugs, religiously-sensitive terms). See scripts/word-blocklist.mjs.
    .filter((w) => !isBlockedWord(w));

  await wordnet.init();

  const pool = [];
  const seen = new Set();
  let synCount = 0;
  let glossCount = 0;
  let droppedNoClue = 0;

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

    // Try each sense; take the first usable clue. Prefer noun/adjective senses
    // (they read best as clues) by ordering them first.
    const ordered = defs.slice().sort((a, b) => {
      const score = (d) =>
        /noun/.test(d.meta?.synsetType ?? "")
          ? 0
          : /adjective/.test(d.meta?.synsetType ?? "")
            ? 1
            : 2;
      return score(a) - score(b);
    });

    const best = bestClue(ordered, answer);
    if (!best) {
      droppedNoClue++; // no synonym or clean definition — not puzzle-worthy
      continue;
    }
    // Reject a clue that itself contains a blocked word (e.g. DEVIL clued as
    // "Satan"). Rare enough that dropping the word is fine.
    if (!isBlockedEntry(answer, best.clue)) {
      if (best.kind === "synonym") synCount++;
      else glossCount++;
      pool.push({ answer, clue: best.clue });
    }
  }

  const out = join(__dirname, "..", "infra", "lambda", "word-pool.json");
  writeFileSync(out, JSON.stringify(pool), "utf8");
  console.log(`Wrote ${pool.length} words to ${out}`);
  console.log(
    `  clue sources — synonym: ${synCount}, gloss: ${glossCount}; dropped (no good clue): ${droppedNoClue}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
