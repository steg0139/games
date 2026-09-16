import { useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import "./UpdatePrompt.css";

/**
 * Handles PWA updates:
 *  - When a new version is available and the app is REOPENED (tab becomes
 *    visible again), auto-reload into it once — no manual pull-to-refresh.
 *  - While the app is actively open, show a non-intrusive banner so we don't
 *    yank the page out from under someone mid-move.
 */
export default function UpdatePrompt() {
  const [updateReady, setUpdateReady] = useState(false);
  const updateSW = useRef<((reload?: boolean) => Promise<void>) | null>(null);
  const reloadedOnce = useRef(false);

  useEffect(() => {
    updateSW.current = registerSW({
      onNeedRefresh() {
        setUpdateReady(true);
        // If the app isn't currently in focus (e.g. it's being reopened), apply
        // immediately. Otherwise the banner + visibility handler take over.
        if (document.visibilityState !== "visible") {
          applyUpdate();
        }
      },
    });

    const onVisible = () => {
      if (document.visibilityState === "visible" && updateReady) {
        applyUpdate();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateReady]);

  const applyUpdate = () => {
    if (reloadedOnce.current) return; // guard against reload loops
    reloadedOnce.current = true;
    void updateSW.current?.(true); // activate new SW and reload
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
