// PWA install + share helpers, isolating the browser quirks.

// The beforeinstallprompt event isn't in the standard lib types.
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** True when the app is running as an installed PWA (standalone display). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mql = window.matchMedia?.("(display-mode: standalone)");
  // iOS Safari exposes navigator.standalone instead of display-mode.
  const iosStandalone = (navigator as { standalone?: boolean }).standalone;
  return Boolean(mql?.matches || iosStandalone);
}

/** True on iOS Safari, where install must be done manually via the Share menu. */
export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as Mac; detect touch to disambiguate.
    (ua.includes("Macintosh") && "ontouchend" in document);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

/** Share the app via the native share sheet, or copy the link as a fallback.
 *  Returns "shared", "copied", or "unavailable". */
export async function shareApp(): Promise<"shared" | "copied" | "unavailable"> {
  const url = window.location.origin;
  const shareData = {
    title: "Card Games",
    text: "Play Solitaire, Blackjack, and Video Poker.",
    url,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch {
      // User cancelled or share failed — fall through to copy.
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return "copied";
    } catch {
      return "unavailable";
    }
  }

  return "unavailable";
}
