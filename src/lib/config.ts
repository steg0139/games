// Runtime configuration. API base URL comes from a Vite env var so the
// same build can point at different backends (or none, for pure-local mode).
//
// Set VITE_API_BASE_URL in a .env file or your hosting env, e.g.
//   VITE_API_BASE_URL=https://abc123.execute-api.us-east-2.amazonaws.com
// When unset, the app runs fully local (no cloud backup).

export const API_BASE_URL: string | undefined =
  import.meta.env.VITE_API_BASE_URL?.trim() || undefined;

export const CLOUD_SYNC_ENABLED = Boolean(API_BASE_URL);
