// Pure key/validation helpers for the profile + daily-competition API.
// Extracted from the handler so they can be unit-tested without the AWS SDK.

export const SK_PROFILE = "PROFILE";
export const SK_PUBLIC = "PUBLIC";

export function pk(deviceId: string): string {
  return `DEVICE#${deviceId}`;
}

export function codePk(code: string): string {
  return `CODE#${code}`;
}

/** Friend codes: 8 chars from our unambiguous alphabet, formatted XXXX-XXXX.
 *  Normalize + validate server-side so the stored key is canonical. Returns
 *  the canonical code or null if it doesn't match. */
const CODE_RE =
  /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-?[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

export function normalizeCode(raw: string): string | null {
  const up = raw.trim().toUpperCase().replace(/\s/g, "");
  if (!CODE_RE.test(up)) return null;
  const compact = up.replace("-", "");
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

// Daily competition: one result per person per game per day per variant.
//   PK = DAILY#<game>#<day>#<variant>,  SK = CODE#<code>
// Keying the partition by game+day+variant lets a device BatchGet exactly
// [itself + its friends] for that board — no enumeration of strangers.
export const DAILY_GAMES = new Set(["crossword", "sudoku", "wordsearch"]);

/** Allowed difficulty variants per game. Crossword has a single board ("-"). */
export const DAILY_VARIANTS: Record<string, Set<string>> = {
  crossword: new Set(["-"]),
  sudoku: new Set(["easy", "regular"]),
  wordsearch: new Set(["easy", "medium", "hard"]),
};

// Day number is days-since-epoch; keep it in a sane window (not 0, not absurd).
// 15000 ≈ 2011-01; 100000 ≈ year 2243. Comfortably brackets any real daily.
export const MIN_DAY = 15000;
export const MAX_DAY = 100000;

export function dailyPk(game: string, day: number, variant: string): string {
  return `DAILY#${game}#${day}#${variant}`;
}

/** Validate a {game, day, variant} triple. Returns the normalized parts, or
 *  null if anything is out of range. */
export function readDailyKey(input: {
  game?: unknown;
  day?: unknown;
  variant?: unknown;
}): { game: string; day: number; variant: string } | null {
  const game = typeof input.game === "string" ? input.game : "";
  if (!DAILY_GAMES.has(game)) return null;
  const day =
    typeof input.day === "number" && Number.isInteger(input.day) ? input.day : NaN;
  if (!Number.isFinite(day) || day < MIN_DAY || day > MAX_DAY) return null;
  const variant = typeof input.variant === "string" ? input.variant : "-";
  if (!DAILY_VARIANTS[game].has(variant)) return null;
  return { game, day, variant };
}
