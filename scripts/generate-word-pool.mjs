// Build a large {answer, clue} pool for the crossword generator Lambda.
//   node scripts/generate-word-pool.mjs
// ANSWERS come from "Spread the Word(list)" — a curated, quality-scored
// crossword answer list (CC BY-NC-SA 4.0, https://www.spreadthewordlist.com).
// We keep single words scored >= 50 (the "clean" tier), 3-8 letters, that also
// have a WordNet entry so we can clue them. CLUES are generated from WordNet
// (public domain). The google-10000 frequency list is used only to vet
// synonyms (reject obscure/foreign ones). All inputs are build-time; only the
// small word-pool.json ships in the Lambda.
//
// Attribution (required by STWL's CC BY-NC-SA 4.0 license) is shown in-app on
// the Stats & Settings screen.
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

// Common-word frequency list — used ONLY to vet synonyms (not as answers).
const FREQ_LIST_URL =
  "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt";

// Answer source: Spread the Word(list), uppercase scored list "WORD;SCORE".
const STWL_URL =
  "https://www.spreadthewordlist.com/downloads/spreadthewordlist_caps.txt";
// Minimum STWL quality score to accept an answer (50+ is the "clean" tier).
const MIN_STWL_SCORE = 50;

// Common English words (the frequency list), lower-cased. A synonym is only
// used as a clue if every one of its words is in here — this is what keeps out
// WordNet's foreign ("poulet"), archaic/technical ("supernumerary",
// "perfective"), and variant-spelling ("prevue", "bronzy") synset members,
// which are the biggest source of "far-fetched / unknown" clues. Populated in
// main() once the list is fetched. A few ultra-common connective words that
// the 10k list may omit are allowed too.
// word -> 0-based frequency rank (lower = more common). Populated in main().
const COMMON_RANK = new Map();
const ALLOWED_SMALL_WORDS = new Set([
  "a", "an", "the", "of", "to", "in", "on", "at", "by", "or", "and", "as",
  "for", "up", "off", "out",
]);

/** True if `word` (possibly multi-word) is made entirely of common English
 *  words, so it reads as a fair clue rather than obscure jargon. */
function isCommonPhrase(word) {
  const parts = word.toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(
    (p) => COMMON_RANK.has(p) || ALLOWED_SMALL_WORDS.has(p),
  );
}

/** Lower = more common/familiar. A phrase scores by its rarest word (so a
 *  2-word synonym with one obscure half ranks poorly). Unknown -> very large. */
function commonalityScore(word) {
  const parts = word.toLowerCase().split(/\s+/).filter(Boolean);
  let worst = 0;
  for (const p of parts) {
    const r = COMMON_RANK.has(p) ? COMMON_RANK.get(p) : 1e9;
    worst = Math.max(worst, r);
  }
  return worst;
}

/** Reject a synonym that's just a spelling variant / near-duplicate of the
 *  answer (COLOR/COLOUR, THEATRE/THEATER, PREVIEW/PREVUE) — useless as a clue.
 *  Uses a cheap edit-distance <= 2 on close-length words plus the shared-stem
 *  check callers already apply. */
function tooSimilar(a, b) {
  const x = a.toLowerCase().replace(/\s+/g, "");
  const y = b.toLowerCase().replace(/\s+/g, "");
  if (Math.abs(x.length - y.length) > 2) return false;
  // Levenshtein up to 3 (bail early).
  const dp = Array.from({ length: x.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= y.length; j++) dp[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[x.length][y.length] <= 2;
}

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
    // Reject Roman-numeral tokens (iii, iv, xl...) and other cryptic non-words
    // that happen to be in the frequency list — "III" is not a fair clue.
    .filter((w) => !w.split(" ").some((p) => /^[ivxlcdm]+$/i.test(p)))
    // Reject if ANY word in the (possibly multiword) synonym shares the
    // answer's stem — otherwise phrases like "free people" leak FREE.
    .filter((w) => !w.split(" ").some((part) => sharesStem(part, answer)))
    // KEY FILTER: only keep synonyms made of common English words. This drops
    // WordNet's foreign / archaic / technical / variant-spelling synset members
    // (poulet, caiman, supernumerary, perfective, prevue, bronzy, beatnik...)
    // that read as impossible clues.
    .filter((w) => isCommonPhrase(w))
    // Drop near-duplicate spellings of the answer (color/colour, preview/prevue).
    .filter((w) => !tooSimilar(w, answer))
    // Drop generic head-noun "synonyms" that describe a figurative sense rather
    // than the word (SHOES -> "place", via the "in my shoes" synset). These are
    // non-discriminating and make unsolvable clues.
    .filter((w) => !GENERIC_SYNONYM.has(w.toLowerCase()))
    // Prefer a single word, then the MOST COMMON/familiar synonym (not the
    // shortest — shortest gave MERRY -> "gay" over "jolly", TRIO -> "iii").
    .sort(
      (a, b) =>
        a.split(" ").length - b.split(" ").length ||
        commonalityScore(a) - commonalityScore(b) ||
        a.length - b.length,
    );
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
  // Reject vague/figurative glosses that don't actually point at the word.
  // These describe an abstract sense and would fit dozens of answers — e.g.
  // SHOES -> "a particular situation" (the "in my shoes" sense), THING -> "a
  // special situation". If the gloss is ONLY a generic head-noun phrase, drop
  // it so the word falls back to a synonym or is dropped entirely.
  if (isVagueGloss(clue)) return null;
  return titleCase(clue);
}

// Phrases that signal a vague/figurative gloss which doesn't point at the word.
// "a particular/special situation" (SHOES, THING) always fails. Bare generic
// head-nouns only fail when the gloss is SHORT (no discriminating detail after
// them) — "A place where ships dock" is fine, "A particular place" is not.
const ALWAYS_VAGUE = [
  /^an? (particular|special|specific|certain|given|other|single) /i,
  /^(someone|something|somebody|anyone|anything) /i,
  /^the (act|state|quality|property|condition|process|activity|way|manner|fact|degree|extent) of\b/i,
];
const GENERIC_HEADS =
  /^an? (situation|state|condition|quality|manner|way|thing|one|part|amount|degree|instance|kind|type|form|unit|point|position|area|portion|piece|member)\b/i;

// One-word synonyms too generic to point at a specific answer.
const GENERIC_SYNONYM = new Set([
  "place", "thing", "one", "part", "point", "way", "state", "unit", "item",
  "piece", "area", "kind", "type", "form", "object", "matter", "stuff",
  "entity", "being", "person", "group", "set", "member", "amount", "degree",
]);

/** True if a gloss is too generic/figurative to be a fair clue. */
function isVagueGloss(clue) {
  if (ALWAYS_VAGUE.some((re) => re.test(clue))) return true;
  // A generic head-noun with little else (<= 4 words total) is non-specific.
  if (GENERIC_HEADS.test(clue) && clue.split(/\s+/).length <= 4) return true;
  return false;
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
 * True if `answer` is only present in WordNet as a PROPER NOUN or ACRONYM, so
 * it shouldn't be a casual-crossword answer. WordNet preserves original casing
 * in each synset's `words`: a common noun appears lowercase ("zebra"), while a
 * proper noun is capitalized ("Bronte", "Klee") and an acronym/abbreviation is
 * uppercase ("AARP", "FBI"). If every sense that contains the answer has it
 * capitalized/uppercased, treat it as a name/acronym and drop it.
 */
function isProperOrAcronym(defs, answer) {
  const lc = answer.toLowerCase();
  let sawAnswer = false;
  for (const d of defs) {
    for (const wObj of d.meta?.words ?? []) {
      const raw = String(wObj.word);
      // Compare the bare token (strip WordNet's lexical "(a)" suffixes/underscores).
      const bare = raw.replace(/\(.*\)/g, "").replace(/_/g, " ").trim();
      if (bare.toLowerCase() !== lc) continue;
      sawAnswer = true;
      // A lowercase occurrence means it's a legit common word → not proper.
      if (bare === bare.toLowerCase()) return false;
    }
  }
  // Only flag as proper/acronym if we actually saw the answer and every
  // occurrence was capitalized/uppercased.
  return sawAnswer;
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
  // Tier 1: a short DEFINITION. Definitions are unambiguous — they describe the
  // intended sense in words — whereas a lone synonym can be a confusing
  // wrong-register sense (MERRY->"Gay", THEATRE->"House"). So we prefer a
  // concise gloss when one is short enough to fit.
  for (const d of defs) {
    const c = usable(glossClue(d.glossary ?? "", answer), answer);
    if (c) return { clue: c, kind: "gloss" };
  }
  // Tier 2: a common-English synonym, when no gloss fit (keeps snappy clues
  // like "Error" for MISTAKE where the definition would be long/awkward).
  for (const d of defs) {
    const c = usable(synonymClue(d, answer), answer);
    if (c) return { clue: c, kind: "synonym" };
  }
  return null;
}

async function main() {
  // 1) Frequency list -> COMMON_RANK, used only to vet synonyms.
  const freqResp = await fetch(FREQ_LIST_URL);
  if (!freqResp.ok) throw new Error(`freq list fetch failed: ${freqResp.status}`);
  (await freqResp.text())
    .split("\n")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
    .forEach((w, i) => {
      if (/^[a-z]+$/.test(w) && !COMMON_RANK.has(w)) COMMON_RANK.set(w, i);
    });

  // 2) Spread the Word(list) -> answer candidates. Lines are "WORD;SCORE".
  // Keep single words (3-8 letters) at the clean-tier score, de-duped and
  // ordered best-score-first. The WordNet lookup below further restricts to
  // cluable words, which also drops acronyms/proper nouns (AAA, AARP, AARON).
  const stwlResp = await fetch(STWL_URL);
  if (!stwlResp.ok) throw new Error(`STWL fetch failed: ${stwlResp.status}`);
  const scored = new Map(); // word -> best score
  for (const line of (await stwlResp.text()).split("\n")) {
    const semi = line.lastIndexOf(";");
    if (semi < 0) continue;
    const word = line.slice(0, semi).trim().toLowerCase();
    const score = parseInt(line.slice(semi + 1), 10);
    if (!/^[a-z]{3,8}$/.test(word)) continue;
    if (!Number.isFinite(score) || score < MIN_STWL_SCORE) continue;
    if (isBlockedWord(word)) continue; // profanity/slurs/sensitive terms
    scored.set(word, Math.max(scored.get(word) ?? 0, score));
  }
  const candidates = [...scored.keys()].sort(
    (a, b) => scored.get(b) - scored.get(a),
  );
  console.log(`STWL candidates (score>=${MIN_STWL_SCORE}, 3-8 letters): ${candidates.length}`);

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

    // Skip proper nouns (BRONTE, KLEE, PYRRHUS) and acronyms (AARP, ABC, FBI) —
    // too trivia-ish / obscure for a casual daily, even if STWL rates them.
    if (isProperOrAcronym(defs, answer)) continue;

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
