// Local-first profile store. Reads/writes localStorage synchronously and
// mirrors changes to the cloud in the background (debounced). On init it
// reconciles the local copy with any cloud copy.
import {
  deleteRemoteProfile,
  fetchRemoteProfile,
  pushPublicProfile,
  pushRemoteProfile,
} from "./sync";
import {
  type Friend,
  type Profile,
  PROFILE_VERSION,
  defaultProfile,
  generateFriendCode,
  mergeProfiles,
  normalizeFriendCode,
  toPublicProfile,
} from "./types";

const STORAGE_KEY = "cards.profile";
const PUSH_DEBOUNCE_MS = 1500;

type Listener = (profile: Profile) => void;

function readLocal(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProfile();
    const parsed = JSON.parse(raw) as Partial<Profile>;
    // Merge onto defaults so schema additions don't break older saves.
    const d = defaultProfile();
    return {
      ...d,
      ...parsed,
      version: PROFILE_VERSION,
      friends: Array.isArray(parsed.friends) ? parsed.friends : d.friends,
      settings: { ...d.settings, ...parsed.settings },
      solitaire: { ...d.solitaire, ...parsed.solitaire },
      blackjack: { ...d.blackjack, ...parsed.blackjack },
      videopoker: { ...d.videopoker, ...parsed.videopoker },
      crossword: { ...d.crossword, ...parsed.crossword },
      sudoku: { ...d.sudoku, ...parsed.sudoku },
      wordsearch: { ...d.wordsearch, ...parsed.wordsearch },
    };
  } catch {
    return defaultProfile();
  }
}

function writeLocal(profile: Profile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Out of space or unavailable — nothing else we can do locally.
  }
}

class ProfileStore {
  private profile: Profile = readLocal();
  private listeners = new Set<Listener>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;

  getProfile(): Profile {
    return this.profile;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Reconcile with the cloud once, on app start. Safe to call repeatedly. */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const remote = await fetchRemoteProfile();
    if (remote) {
      const merged = mergeProfiles(this.profile, remote);
      if (merged !== this.profile) {
        this.profile = merged;
        writeLocal(merged);
        this.emit();
      }
      // If local was newer, push it up so the cloud catches up.
      if (this.profile.updatedAt > remote.updatedAt) {
        this.schedulePush();
      }
    } else if (this.profile.updatedAt > 0) {
      // No cloud copy but we have local data — back it up.
      this.schedulePush();
    }
  }

  /** Apply a pure update to the profile, persist locally, schedule cloud push. */
  update(mutator: (draft: Profile) => Profile): void {
    const next = mutator(this.profile);
    next.updatedAt = Date.now();
    next.version = PROFILE_VERSION;
    this.profile = next;
    writeLocal(next);
    this.emit();
    this.schedulePush();
  }

  /** Ensure this profile has a public friend code, assigning one on first use.
   *  Returns the code. Safe to call repeatedly (idempotent). */
  ensureFriendCode(): string {
    if (this.profile.friendCode) return this.profile.friendCode;
    const code = generateFriendCode();
    this.update((p) => ({ ...p, friendCode: code }));
    return code;
  }

  /** Set the public display name (trimmed, capped). Assigns a friend code too
   *  so the profile is immediately shareable. */
  setDisplayName(name: string): void {
    const clean = name.trim().slice(0, 24);
    this.update((p) => ({
      ...p,
      displayName: clean,
      friendCode: p.friendCode || generateFriendCode(),
    }));
  }

  /** Add a friend by their public code. Normalizes + dedupes; refuses adding
   *  your own code. Returns the normalized code added, or null if invalid. */
  addFriend(code: string, displayName = ""): string | null {
    const normalized = normalizeFriendCode(code);
    if (!normalized) return null;
    if (normalized === this.profile.friendCode) return null; // can't friend yourself
    if (this.profile.friends.some((f) => f.code === normalized)) {
      // Already added — just refresh the cached name if we got a better one.
      if (displayName) this.updateFriendName(normalized, displayName);
      return normalized;
    }
    const friend: Friend = {
      code: normalized,
      displayName: displayName.trim().slice(0, 24),
      addedAt: Date.now(),
    };
    this.update((p) => ({ ...p, friends: [...p.friends, friend] }));
    return normalized;
  }

  /** Update the cached display name for an already-added friend (no-op if
   *  not present or unchanged). */
  updateFriendName(code: string, displayName: string): void {
    const clean = displayName.trim().slice(0, 24);
    const existing = this.profile.friends.find((f) => f.code === code);
    if (!existing || existing.displayName === clean) return;
    this.update((p) => ({
      ...p,
      friends: p.friends.map((f) =>
        f.code === code ? { ...f, displayName: clean } : f,
      ),
    }));
  }

  /** Remove a friend by code. */
  removeFriend(code: string): void {
    if (!this.profile.friends.some((f) => f.code === code)) return;
    this.update((p) => ({
      ...p,
      friends: p.friends.filter((f) => f.code !== code),
    }));
  }

  /**
   * Reset all stats and settings to defaults, locally and in the cloud.
   * Cancels any pending push so the reset isn't overwritten, and deletes the
   * cloud copy so it won't be restored on next load.
   */
  async clear(): Promise<void> {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    const fresh = defaultProfile();
    this.profile = fresh;
    writeLocal(fresh);
    this.emit();
    await deleteRemoteProfile();
  }

  private schedulePush(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      const snapshot = this.profile;
      // Private full-blob backup (device-keyed, last-writer-wins).
      void pushRemoteProfile(snapshot);
      // Public mirror so friends can read sanitized stats. Only when the user
      // has opted into being shareable (has a friend code). Independent of the
      // private push so one failing doesn't block the other.
      if (snapshot.friendCode) {
        void pushPublicProfile(toPublicProfile(snapshot));
      }
    }, PUSH_DEBOUNCE_MS);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.profile);
  }
}

export const profileStore = new ProfileStore();
