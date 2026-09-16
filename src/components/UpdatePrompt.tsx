import { useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import "./UpdatePrompt.css";

/**
 * Handles PWA updates:
 *  - Actively checks for a new service worker on load and whenever the app is
 *    reopened (tab/PWA becomes visible), because an installed PWA resuming does
 *    not otherwise re-check — which is why updates needed manual refreshing.
 *  - When an update is found: if the app was just reopened (not actively in
 *    focus), reload straight into it; if the user is actively using the app,
 *    show a non-intrusive "reload" banner instead of yanking the page.
 */
export default function UpdatePrompt() {
  const [updateReady, setUpdateReady] = useState(false);
  const updateSWRef = useRef<((reload?: boolean) => Promise<void>) | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const updateReadyRef = useRef(false);
  const reloadedOnce = useRef(false);

  // Register the service worker exactly once.
  useEffect(() => {
    updateSWRef.current = registerSW({
      onRegisteredSW(_swUrl, registration) {
        registrationRef.current = registration;
        // Check right away in case a new version shipped since last load.
        void registration?.update();
      },
      onNeedRefresh() {
        updateReadyRef.current = true;
        setUpdateReady(true);
        // Reopened (not actively focused) -> apply immediately. Actively in
        // use -> the banner (below) lets the user choose.
        if (document.visibilityState !== "visible") applyUpdate();
      },
    });

    // On reopen/focus: ask the SW to check for a new version. If one is already
    // pending, apply it now.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (updateReadyRef.current) {
        applyUpdate();
      } else {
        void registrationRef.current?.update();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const applyUpdate = () => {
    if (reloadedOnce.current) return; // guard against reload loops
    reloadedOnce.current = true;
    void updateSWRef.current?.(true); // activate new SW and reload
  };

  if (!updateReady) return null;

  return (
    <div className="update-banner" role="status">
      <span>A new version is available.</span>
      <button className="update-btn" onClick={applyUpdate}>
        Reload
      </button>
    </div>
  );
}
