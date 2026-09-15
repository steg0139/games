// Cloud backup client. Talks to the backend profile API keyed by device id.
// All calls fail soft: if the network or backend is unavailable, the app
// keeps working from localStorage.
import { API_BASE_URL, CLOUD_SYNC_ENABLED } from "../config";
import { getDeviceId } from "../device";
import { type Profile, PROFILE_VERSION, defaultProfile } from "./types";

const TIMEOUT_MS = 8000;

function withTimeout(signal?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  // Clear the timer if the request settles first.
  controller.signal.addEventListener("abort", () => clearTimeout(timer), {
    once: true,
  });
  return controller.signal;
}

/** Fetch the cloud profile for this device, or null if none / unavailable. */
export async function fetchRemoteProfile(): Promise<Profile | null> {
  if (!CLOUD_SYNC_ENABLED) return null;
  const deviceId = getDeviceId();

  try {
    const res = await fetch(`${API_BASE_URL}/profile`, {
      method: "GET",
      headers: { "x-device-id": deviceId },
      signal: withTimeout(),
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;

    const data = (await res.json()) as Partial<Profile> | null;
    if (!data || typeof data !== "object") return null;

    // Normalize against the current shape so missing fields don't break us.
    return { ...defaultProfile(), ...data, version: PROFILE_VERSION } as Profile;
  } catch {
    return null;
  }
}

/** Delete this device's cloud profile. Returns true on success. */
export async function deleteRemoteProfile(): Promise<boolean> {
  if (!CLOUD_SYNC_ENABLED) return false;
  const deviceId = getDeviceId();

  try {
    const res = await fetch(`${API_BASE_URL}/profile`, {
      method: "DELETE",
      headers: { "x-device-id": deviceId },
      signal: withTimeout(),
    });
    // 404 means there was nothing to delete — treat as success.
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/** Push the profile to the cloud. Returns true on success. */
export async function pushRemoteProfile(profile: Profile): Promise<boolean> {
  if (!CLOUD_SYNC_ENABLED) return false;
  const deviceId = getDeviceId();

  try {
    const res = await fetch(`${API_BASE_URL}/profile`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-device-id": deviceId,
      },
      body: JSON.stringify(profile),
      signal: withTimeout(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
