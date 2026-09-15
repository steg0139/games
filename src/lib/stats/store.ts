// Local-first profile store. Reads/writes localStorage synchronously and
// mirrors changes to the cloud in the background (debounced). On init it
// reconciles the local copy with any cloud copy.
import {
  deleteRemoteProfile,
  fetchRemoteProfile,
  pushRemoteProfile,
} from "./sync";
import {
  type Profile,
  PROFILE_VERSION,
  defaultProfile,
  mergeProfiles,
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
    return {
      ...defaultProfile(),
      ...parsed,
      version: PROFILE_VERSION,
      settings: { ...defaultProfile().settings, ...parsed.settings },
      solitaire: { ...defaultProfile().solitaire, ...parsed.solitaire },
      blackjack: { ...defaultProfile().blackjack, ...parsed.blackjack },
      videopoker: { ...defaultProfile().videopoker, ...parsed.videopoker },
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
      void pushRemoteProfile(this.profile);
    }, PUSH_DEBOUNCE_MS);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.profile);
  }
}

export const profileStore = new ProfileStore();
