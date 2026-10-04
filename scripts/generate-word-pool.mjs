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
//   2. a fill-in-the-blank from an example usage (e.g. "A ___ recovery")
//   3. a SHORT gloss (first clause only), and only if it fits without trimming
// Anything that would need mid-sentence truncation is rejected outright.
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
 */
function synonymClue(def, answer) {
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
 * A fill-in-the-blank clue from a quoted example usage in the gloss, with the
 * answer (or a shared-stem word) blanked out. e.g. "a speedy recovery" ->
 * "A ___ recovery". Returns null if no example contains the answer.
 */
function fillBlankClue(glossary, answer) {
  const examples = [...glossary.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const ans = answer.toLowerCase();
  for (const ex of examples) {
    const words = ex.split(/\s+/);
    const idx = words.findIndex((w) => {
      const bare = w.replace(/[^a-zA-Z]/g, "").toLowerCase();
      return bare === ans;
    });
    if (idx === -1) continue;
    words[idx] = words[idx].replace(/[a-zA-Z]+/, "___");
    const clue = clean(words.join(" "));
    // Count the surrounding quotes toward the length budget.
    if (clue.length >= MIN_CLUE_LEN && clue.length + 2 <= MAX_CLUE_LEN) {
      return `"${titleCase(clue)}"`;
    }
  }
  return null;
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

/** Build the best available clue for an answer from one WordNet sense. */
function clueFromDef(def, answer) {
  const clue =
    synonymClue(def, answer) ??
    fillBlankClue(def.glossary ?? "", answer) ??
    glossClue(def.glossary ?? "", answer);
  if (!clue) return null;
  if (clueLeaksAnswer(clue, answer)) return null;
  return clue;
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
  let blankCount = 0;
  let glossCount = 0;

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

    let clue = null;
    for (const d of ordered) {
      const candidate = clueFromDef(d, answer);
      // Skip a clue that itself contains a blocked word (e.g. DEVIL clued as
      // "Satan", or a fill-in-the-blank mentioning death). Keep trying other
      // senses — the word may have a clean clue elsewhere.
      if (candidate && !isBlockedEntry(answer, candidate)) {
        clue = candidate;
        if (clue.startsWith('"')) blankCount++;
        else if (clue === synonymClue(d, answer)) synCount++;
        else glossCount++;
        break;
      }
    }
    if (clue) pool.push({ answer, clue });
  }

  const out = join(__dirname, "..", "infra", "lambda", "word-pool.json");
  writeFileSync(out, JSON.stringify(pool), "utf8");
  console.log(`Wrote ${pool.length} words to ${out}`);
  console.log(
    `  clue sources — synonym: ${synCount}, fill-blank: ${blankCount}, gloss: ${glossCount}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
