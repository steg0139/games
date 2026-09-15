// Stable anonymous device identifier, persisted in localStorage.
// Used to key this device's stats/settings in the cloud backup.

const DEVICE_ID_KEY = "cards.deviceId";

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDeviceId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    // localStorage unavailable (private mode edge cases) — fall through.
  }

  if (!id) {
    id = generateId();
    try {
      localStorage.setItem(DEVICE_ID_KEY, id);
    } catch {
      // If we can't persist, we still return a usable per-session id.
    }
  }
  return id;
}
