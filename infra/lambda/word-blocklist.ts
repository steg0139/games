// Runtime safety-net blocklist for the daily puzzle Lambdas. The word pool
// (word-pool.json) is already filtered at build time by
// scripts/word-blocklist.mjs — this mirrors that list so a stale or
// un-regenerated pool can still never surface an inappropriate word. Keep the
// two lists in sync when editing. Matching is whole-word (via tokenization),
// not substring, to avoid false positives like "grape" / "assassin".

const BLOCKLIST: string[] = [
  // Profanity / vulgar
  "ass", "asses", "arse", "bastard", "bitch", "crap", "damn", "dick",
  "piss", "shit", "turd", "fart", "prick", "wanker", "bollocks",
  // Slurs
  "slur", "retard", "retarded", "spastic", "fag", "faggot", "dyke",
  "tranny", "negro", "coon", "chink", "spic", "wop", "kike", "gook",
  "cripple",
  // Sexual / adult
  "sex", "sexual", "sexy", "porn", "porno", "erotic", "erotica", "nude",
  "naked", "nudity", "orgasm", "orgy", "penis", "vagina", "genital",
  "genitalia", "breast", "boob", "nipple", "testicle", "scrotum", "sperm",
  "semen", "ejaculate", "masturbate", "fetish", "incest", "pedophile",
  "molest", "rape", "rapist", "whore", "slut", "prostitute", "hooker",
  "brothel", "condom", "virginity", "lust", "horny", "aroused",
  "intercourse", "fornicate", "sodomy", "bdsm", "lingerie",
  "lesbian", "homosexual", "bisexual", "transgender", "transsexual",
  // Graphic violence / death / self-harm
  "kill", "killer", "killing", "murder", "murderer", "slaughter", "massacre",
  "corpse", "cadaver", "gore", "mutilate", "behead", "decapitate", "torture",
  "suicide", "homicide", "manslaughter", "lynch", "lynching", "genocide",
  "bloodbath", "slay", "stab", "strangle", "suffocate", "overdose",
  "death", "dead", "die", "dying", "deceased", "fatal", "coffin", "grave",
  "morgue", "casket", "hearse", "slave", "slavery", "enslave",
  // Weapons
  "gun", "rifle", "pistol", "shotgun", "firearm", "handgun", "ammo",
  "ammunition", "grenade", "bomb", "explosive", "missile", "warhead",
  "weapon", "dagger", "bayonet",
  // Drugs / alcohol
  "drug", "cocaine", "heroin", "meth", "methamphetamine", "marijuana",
  "cannabis", "weed", "crack", "opioid", "opium", "narcotic", "ecstasy",
  "overdosed", "junkie", "addict", "cigarette", "tobacco", "nicotine",
  "booze", "drunk", "drunkard", "alcoholic", "beer", "wine", "liquor",
  "whiskey", "vodka", "brandy", "rum", "tequila", "intoxicated", "stoned",
  // Religious / occult sensitivities
  "abortion", "abort", "abortions", "devil", "satan", "satanic", "lucifer",
  "demon", "demonic", "hell", "damnation", "occult", "witch", "witchcraft",
  "wicca", "wiccan", "pagan", "paganism", "sorcery", "sorcerer", "warlock",
  "voodoo", "seance", "exorcism", "exorcist", "heathen", "heresy", "heretic",
  "blasphemy", "blaspheme", "antichrist", "sin", "sinful", "damned", "curse",
  "cursed", "evil", "wicked", "pentagram", "ouija", "incubus", "succubus",
  // Gambling
  "casino", "gamble", "gambling",
  // Hate / extremism
  "nazi", "hitler", "kkk", "terrorist", "terrorism", "jihad",
];

function stem(w: string): string {
  let s = w.toLowerCase();
  s = s.replace(/(ations?|ments?|nesses|ingly)$/i, "");
  s = s.replace(/(ings?|ers?|eds?|ions?| ness|ages?|ies|ic|ly|al|s)$/i, "");
  s = s.replace(/(.)\1$/, "$1");
  return s;
}

const BLOCKED_EXACT = new Set(BLOCKLIST.map((w) => w.toLowerCase()));
const BLOCKED_STEMS = new Set(BLOCKLIST.map(stem));

/** A single token is blocked (exact match or shared stem). */
export function isBlockedWord(token: string): boolean {
  const t = token.toLowerCase().replace(/[^a-z]/g, "");
  if (!t) return false;
  if (BLOCKED_EXACT.has(t)) return true;
  const st = stem(t);
  return st.length >= 3 && BLOCKED_STEMS.has(st);
}

/** True if `answer` or any whole word of `clue` is blocked. */
export function isBlockedEntry(answer: string, clue?: string): boolean {
  if (isBlockedWord(answer)) return true;
  const tokens = (clue ?? "").split(/[^a-zA-Z]+/).filter(Boolean);
  return tokens.some(isBlockedWord);
}
