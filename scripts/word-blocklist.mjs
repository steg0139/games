// Blocklist for the crossword / word-search pool. A word is excluded if its
// ANSWER or any whole word in its CLUE matches an entry here (or a close
// morphological variant). Matching is whole-word (not substring) to avoid the
// "Scunthorpe problem" — e.g. "grape" must not be blocked by "rape", and
// "assassin" must not be blocked by "ass".
//
// Categories: profanity & slurs, sexual/adult content, graphic violence &
// death, drugs/alcohol, and religiously-sensitive terms (per request:
// abortion, devil, hell, etc.). Keep entries lowercase, singular where
// possible — the stemmer handles common inflections (kill/kills/killed).
//
// This is a plain .mjs/.json-free module so both the Node build script and the
// bundled Lambda can import the same source of truth.

export const BLOCKLIST = [
  // --- Profanity / vulgar ---
  "ass", "asses", "arse", "bastard", "bitch", "crap", "damn", "dick",
  "piss", "shit", "turd", "fart", "prick", "wanker", "bollocks",

  // --- Slurs (racial / ethnic / orientation / ableist) ---
  // Intentionally included so they can never surface. Kept minimal + explicit.
  "slur", "retard", "retarded", "spastic", "fag", "faggot", "dyke",
  "tranny", "negro", "coon", "chink", "spic", "wop", "kike", "gook",
  "cripple",

  // --- Sexual / adult ---
  "sex", "sexual", "sexy", "porn", "porno", "erotic", "erotica", "nude",
  "naked", "nudity", "orgasm", "orgy", "penis", "vagina", "genital",
  "genitalia", "breast", "boob", "nipple", "testicle", "scrotum", "sperm",
  "semen", "ejaculate", "masturbate", "fetish", "incest", "pedophile",
  "molest", "rape", "rapist", "whore", "slut", "prostitute", "hooker",
  "brothel", "condom", "virginity", "lust", "horny", "aroused",
  "intercourse", "fornicate", "sodomy", "bdsm", "lingerie",
  "lesbian", "homosexual", "bisexual", "transgender", "transsexual",

  // --- Graphic violence / death / self-harm ---
  "kill", "killer", "killing", "murder", "murderer", "slaughter", "massacre",
  "corpse", "cadaver", "gore", "mutilate", "behead", "decapitate", "torture",
  "suicide", "homicide", "manslaughter", "lynch", "lynching", "genocide",
  "bloodbath", "slay", "stab", "strangle", "suffocate", "overdose",
  "death", "dead", "die", "dying", "deceased", "fatal", "coffin", "grave",
  "morgue", "casket", "hearse", "slave", "slavery", "enslave",

  // --- Weapons (lethal) ---
  "gun", "rifle", "pistol", "shotgun", "firearm", "handgun", "ammo",
  "ammunition", "grenade", "bomb", "explosive", "missile", "warhead",
  "weapon", "dagger", "bayonet",

  // --- Drugs / alcohol / addiction ---
  "drug", "cocaine", "heroin", "meth", "methamphetamine", "marijuana",
  "cannabis", "weed", "crack", "opioid", "opium", "narcotic", "ecstasy",
  "overdosed", "junkie", "addict", "cigarette", "tobacco", "nicotine",
  "booze", "drunk", "drunkard", "alcoholic", "beer", "wine", "liquor",
  "whiskey", "vodka", "brandy", "rum", "tequila", "intoxicated", "stoned",

  // --- Religious / occult sensitivities (per request) ---
  "abortion", "abort", "abortions", "devil", "satan", "satanic", "lucifer",
  "demon", "demonic", "hell", "damnation", "occult", "witch", "witchcraft",
  "wicca", "wiccan", "pagan", "paganism", "sorcery", "sorcerer", "warlock",
  "voodoo", "seance", "exorcism", "exorcist", "heathen", "heresy", "heretic",
  "blasphemy", "blaspheme", "antichrist", "sin", "sinful", "damned", "curse",
  "cursed", "evil", "wicked", "pentagram", "ouija", "incubus", "succubus",

  // --- Gambling (optional, mild) ---
  "casino", "gamble", "gambling",

  // --- Hate / extremism ---
  "nazi", "hitler", "kkk", "terrorist", "terrorism", "jihad",
];

/** Rough stem: lowercases and strips common suffixes so kill/kills/killed and
 *  drug/drugs collapse to the same root. Mirrors the generator's stemmer
 *  closely enough for blocklist matching. */
function stem(w) {
  let s = w.toLowerCase();
  s = s.replace(/(ations?|ments?|nesses|ingly)$/i, "");
  s = s.replace(/(ings?|ers?|eds?|ions?| ness|ages?|ies|ic|ly|al|s)$/i, "");
  s = s.replace(/(.)\1$/, "$1");
  return s;
}

// Pre-compute the set of blocked stems once.
const BLOCKED_STEMS = new Set(BLOCKLIST.map(stem));
const BLOCKED_EXACT = new Set(BLOCKLIST.map((w) => w.toLowerCase()));

/** Is a single token blocked (exact match or shared stem)? */
export function isBlockedWord(token) {
  const t = token.toLowerCase().replace(/[^a-z]/g, "");
  if (!t) return false;
  if (BLOCKED_EXACT.has(t)) return true;
  const st = stem(t);
  // Only treat the stem as a match when it's substantial (>=3), to avoid tiny
  // roots over-matching.
  return st.length >= 3 && BLOCKED_STEMS.has(st);
}

/** True if `answer` or any whole word of `clue` is blocked. */
export function isBlockedEntry(answer, clue) {
  if (isBlockedWord(answer)) return true;
  const tokens = (clue ?? "").split(/[^a-zA-Z]+/).filter(Boolean);
  return tokens.some(isBlockedWord);
}
