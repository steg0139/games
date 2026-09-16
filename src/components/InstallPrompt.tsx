import { useEffect, useState } from "react";
import {
  type BeforeInstallPromptEvent,
  isIosSafari,
  isStandalone,
} from "../lib/pwa";
import "./InstallPrompt.css";

const DISMISS_KEY = "cards.installPromptDismissed";
const SHOW_DELAY_MS = 3000;

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Non-fatal — it may just show again next visit.
  }
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [visible, setVisible] = useState(false);
  const [iosMode, setIosMode] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return;

    // Android/Chrome/Edge: capture the install event to trigger later.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS Safari: no install API — show manual instructions after a delay.
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isIosSafari()) {
      timer = setTimeout(() => {
        setIosMode(true);
        setVisible(true);
      }, SHOW_DELAY_MS);
    }

    // Hide once installed.
    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    rememberDismissed();
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
    rememberDismissed();
  };

  return (
    <div className="install-backdrop" onClick={dismiss}>
      <div
        className="install-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Install Card Games"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="install-icon" aria-hidden>
          ♠
        </div>
        <h2>Install Card Games</h2>

        {iosMode ? (
          <>
            <p>
              Add this app to your home screen for full-screen, offline play.
            </p>
            <ol className="install-steps">
              <li>
                Tap the Share icon <span aria-hidden>⎋</span> in Safari's toolbar.
              </li>
              <li>
                Choose <strong>Add to Home Screen</strong>.
              </li>
            </ol>
            <button className="btn-primary install-cta" onClick={dismiss}>
              Got it
            </button>
          </>
        ) : (
          <>
            <p>
              Install for full-screen play, offline access, and a home-screen
              icon.
            </p>
            <div className="install-actions">
              <button className="icon-btn" onClick={dismiss}>
                Not now
              </button>
              <button className="btn-primary" onClick={install}>
                Install
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
