import { useState } from "react";
import { Link } from "react-router-dom";
import { CLOUD_SYNC_ENABLED } from "../lib/config";
import { getDeviceId } from "../lib/device";
import { clearProfile, updateSettings, useProfile } from "../lib/stats/useProfile";
import "./Stats.css";

function pct(n: number, d: number): string {
  if (d === 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

function fmtTime(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function Stats() {
  const profile = useProfile();
  const s = profile.solitaire;
  const b = profile.blackjack;

  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearProfile();
    } finally {
      setClearing(false);
      setConfirming(false);
    }
  };

  return (
    <div className="stats">
      <header className="app-bar">
        <Link to="/" className="icon-btn" aria-label="Back to menu">
          ←
        </Link>
        <h1>Stats &amp; Settings</h1>
      </header>

      <div className="stats-body">
        <section className="stats-section">
          <h2>♠ Solitaire</h2>
          <div className="stat-grid">
            <div className="stat">
              <div className="value">{s.gamesWon}</div>
              <div className="label">Games won</div>
            </div>
            <div className="stat">
              <div className="value">{pct(s.gamesWon, s.gamesPlayed)}</div>
              <div className="label">Win rate</div>
            </div>
            <div className="stat">
              <div className="value">{s.bestMoves ?? "—"}</div>
              <div className="label">Fewest moves</div>
            </div>
            <div className="stat">
              <div className="value">{fmtTime(s.bestTimeSeconds)}</div>
              <div className="label">Best time</div>
            </div>
            <div className="stat">
              <div className="value">{s.bestStreak}</div>
              <div className="label">Best streak</div>
            </div>
            <div className="stat">
              <div className="value">{s.gamesPlayed}</div>
              <div className="label">Games played</div>
            </div>
          </div>
        </section>

        <section className="stats-section">
          <h2>♦ Blackjack</h2>
          <div className="stat-grid">
            <div className="stat">
              <div className="value">{b.wins}</div>
              <div className="label">Wins</div>
            </div>
            <div className="stat">
              <div className="value">{pct(b.wins, b.handsPlayed)}</div>
              <div className="label">Win rate</div>
            </div>
            <div className="stat">
              <div className="value">${b.bestBankroll}</div>
              <div className="label">Best bankroll</div>
            </div>
            <div className="stat">
              <div className="value">{b.blackjacks}</div>
              <div className="label">Blackjacks</div>
            </div>
            <div className="stat">
              <div className="value">{b.pushes}</div>
              <div className="label">Pushes</div>
            </div>
            <div className="stat">
              <div className="value">{b.handsPlayed}</div>
              <div className="label">Hands played</div>
            </div>
          </div>
        </section>

        <section className="stats-section">
          <h2>Settings</h2>
          <div className="setting-row">
            <span className="label">Sound effects</span>
            <button
              className="toggle"
              role="switch"
              aria-checked={profile.settings.soundEnabled}
              aria-label="Toggle sound effects"
              onClick={() =>
                updateSettings({ soundEnabled: !profile.settings.soundEnabled })
              }
            />
          </div>
        </section>

        <section className="stats-section">
          <h2>Backup</h2>
          <p className="sync-note">
            {CLOUD_SYNC_ENABLED
              ? "Your stats are backed up to the cloud for this device and restored automatically if local data is cleared."
              : "Cloud backup is off. Stats are saved on this device only. Set VITE_API_BASE_URL to enable backup."}
          </p>
          <p className="sync-note" style={{ marginTop: 10 }}>
            Device ID
          </p>
          <p className="device-id">{getDeviceId()}</p>
        </section>

        <section className="stats-section danger-section">
          <h2>Danger zone</h2>
          <p className="sync-note">
            Reset all stats and settings to defaults. This clears data on this
            device{CLOUD_SYNC_ENABLED ? " and its cloud backup" : ""} and can't
            be undone.
          </p>

          {!confirming ? (
            <button
              className="btn-danger"
              onClick={() => setConfirming(true)}
            >
              Clear stats
            </button>
          ) : (
            <div className="confirm-row">
              <button
                className="btn-danger"
                onClick={handleClear}
                disabled={clearing}
              >
                {clearing ? "Clearing…" : "Yes, clear everything"}
              </button>
              <button
                className="icon-btn"
                onClick={() => setConfirming(false)}
                disabled={clearing}
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
