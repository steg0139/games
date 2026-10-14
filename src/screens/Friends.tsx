import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CLOUD_SYNC_ENABLED } from "../lib/config";
import {
  addFriend,
  removeFriend,
  setDisplayName,
  updateFriendName,
  useProfile,
} from "../lib/stats/useProfile";
import { fetchPublicProfile } from "../lib/stats/sync";
import {
  type Friend,
  type PublicProfile,
  toPublicProfile,
} from "../lib/stats/types";
import "./Friends.css";

// Fastest time as m:ss, or an em dash when unset.
function fmtTime(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function pct(n: number, d: number): string {
  if (d === 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

// The rows of the comparison table: each pulls a comparable number (or string)
// from a public profile. `better: "high" | "low"` marks which direction wins so
// we can bold the leader.
interface CompareRow {
  label: string;
  value: (p: PublicProfile) => string;
  // Numeric key for determining the leader (null = not comparable / skip).
  rank: (p: PublicProfile) => number | null;
  better: "high" | "low";
}

const ROWS: CompareRow[] = [
  {
    label: "Solitaire wins",
    value: (p) => String(p.solitaire.gamesWon),
    rank: (p) => p.solitaire.gamesWon,
    better: "high",
  },
  {
    label: "Solitaire win rate",
    value: (p) => pct(p.solitaire.gamesWon, p.solitaire.gamesPlayed),
    rank: (p) =>
      p.solitaire.gamesPlayed === 0
        ? null
        : p.solitaire.gamesWon / p.solitaire.gamesPlayed,
    better: "high",
  },
  {
    label: "Solitaire best time",
    value: (p) => fmtTime(p.solitaire.bestTimeSeconds),
    rank: (p) => p.solitaire.bestTimeSeconds,
    better: "low",
  },
  {
    label: "Blackjack best bankroll",
    value: (p) => `$${p.blackjack.bestBankroll}`,
    rank: (p) => p.blackjack.bestBankroll,
    better: "high",
  },
  {
    label: "Blackjack biggest win",
    value: (p) => `$${p.blackjack.biggestWin}`,
    rank: (p) => p.blackjack.biggestWin,
    better: "high",
  },
  {
    label: "Blackjack biggest bet",
    value: (p) => `$${p.blackjack.biggestBet}`,
    rank: (p) => p.blackjack.biggestBet,
    better: "high",
  },
  {
    label: "Video Poker best bankroll",
    value: (p) => `$${p.videopoker.bestBankroll}`,
    rank: (p) => p.videopoker.bestBankroll,
    better: "high",
  },
  {
    label: "Video Poker best payout",
    value: (p) => `$${p.videopoker.bestPayout}`,
    rank: (p) => p.videopoker.bestPayout,
    better: "high",
  },
  {
    label: "Crossword best time",
    value: (p) => fmtTime(p.crossword.bestTimeSeconds),
    rank: (p) => p.crossword.bestTimeSeconds,
    better: "low",
  },
  {
    label: "Crossword streak",
    value: (p) => String(p.crossword.bestStreak),
    rank: (p) => p.crossword.bestStreak,
    better: "high",
  },
  {
    label: "Sudoku best time",
    value: (p) => fmtTime(p.sudoku.bestTimeSeconds),
    rank: (p) => p.sudoku.bestTimeSeconds,
    better: "low",
  },
  {
    label: "Sudoku hints used",
    value: (p) => String(p.sudoku.hintsUsed),
    rank: (p) => p.sudoku.hintsUsed,
    better: "low",
  },
  {
    label: "Sudoku streak",
    value: (p) => String(p.sudoku.bestStreak),
    rank: (p) => p.sudoku.bestStreak,
    better: "high",
  },
  {
    label: "Word Search best time",
    value: (p) => fmtTime(p.wordsearch.bestTimeSeconds),
    rank: (p) => p.wordsearch.bestTimeSeconds,
    better: "low",
  },
  {
    label: "Word Search streak",
    value: (p) => String(p.wordsearch.bestStreak),
    rank: (p) => p.wordsearch.bestStreak,
    better: "high",
  },
];

// Decide which column (by index) leads a row, or null for a tie / no data.
function leaderIndex(row: CompareRow, cols: PublicProfile[]): number | null {
  let best: number | null = null;
  let bestIdx: number | null = null;
  let tie = false;
  cols.forEach((p, i) => {
    const r = row.rank(p);
    if (r === null) return;
    if (best === null) {
      best = r;
      bestIdx = i;
      return;
    }
    const wins = row.better === "high" ? r > best : r < best;
    const same = r === best;
    if (wins) {
      best = r;
      bestIdx = i;
      tie = false;
    } else if (same) {
      tie = true;
    }
  });
  return tie ? null : bestIdx;
}

export default function Friends() {
  const profile = useProfile();
  const [nameDraft, setNameDraft] = useState(profile.displayName);
  const [codeInput, setCodeInput] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Fetched public profiles for each added friend, keyed by code.
  const [remote, setRemote] = useState<Record<string, PublicProfile | null>>({});
  const [loadingCodes, setLoadingCodes] = useState<Set<string>>(new Set());

  // Keep the name field in sync if the profile changes elsewhere.
  useEffect(() => {
    setNameDraft(profile.displayName);
  }, [profile.displayName]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }, []);

  // Fetch each friend's public profile once (and whenever the friend list
  // changes). Refreshes the cached display name when we learn a newer one.
  useEffect(() => {
    if (!CLOUD_SYNC_ENABLED) return;
    let cancelled = false;
    const codes = profile.friends.map((f) => f.code);
    setLoadingCodes(new Set(codes.filter((c) => remote[c] === undefined)));
    (async () => {
      for (const code of codes) {
        if (remote[code] !== undefined) continue; // already fetched
        const pub = await fetchPublicProfile(code);
        if (cancelled) return;
        setRemote((prev) => ({ ...prev, [code]: pub }));
        setLoadingCodes((prev) => {
          const next = new Set(prev);
          next.delete(code);
          return next;
        });
        if (pub?.displayName) updateFriendName(code, pub.displayName);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.friends.map((f) => f.code).join(",")]);

  const saveName = useCallback(() => {
    setDisplayName(nameDraft);
    flash("Name saved");
  }, [nameDraft, flash]);

  const onCopyCode = useCallback(async () => {
    const code = profile.friendCode;
    if (!code) return;
    try {
      await navigator.clipboard?.writeText(code);
      flash("Code copied");
    } catch {
      flash("Couldn't copy");
    }
  }, [profile.friendCode, flash]);

  const onShareCode = useCallback(async () => {
    const code = profile.friendCode;
    if (!code) return;
    const text = `Add me on Card Games! My friend code is ${code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Card Games", text });
        return;
      } catch {
        /* cancelled — fall through to copy */
      }
    }
    try {
      await navigator.clipboard?.writeText(text);
      flash("Invite copied");
    } catch {
      flash("Couldn't share");
    }
  }, [profile.friendCode, flash]);

  const onAdd = useCallback(async () => {
    setAddError(null);
    const code = addFriend(codeInput);
    if (!code) {
      setAddError(
        codeInput.trim()
          ? "That doesn't look like a valid code (or it's your own)."
          : "Enter a friend code.",
      );
      return;
    }
    setCodeInput("");
    setAdding(true);
    // Fetch their public profile right away so the comparison fills in.
    const pub = await fetchPublicProfile(code);
    setRemote((prev) => ({ ...prev, [code]: pub }));
    if (pub?.displayName) updateFriendName(code, pub.displayName);
    setAdding(false);
    flash(pub ? "Friend added" : "Added — no profile found yet");
  }, [codeInput, flash]);

  const onRemove = useCallback((code: string) => {
    removeFriend(code);
    setRemote((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
  }, []);

  const label = (f: Friend): string => {
    const pub = remote[f.code];
    return pub?.displayName || f.displayName || "Player";
  };

  // Columns for the comparison table: you first, then friends we have a public
  // profile for.
  const me = toPublicProfile(profile);
  const friendCols = profile.friends
    .map((f) => remote[f.code])
    .filter((p): p is PublicProfile => !!p);
  const columns: PublicProfile[] = [me, ...friendCols];
  const headerNames = [
    profile.displayName || "You",
    ...friendCols.map((p) => p.displayName || "Player"),
  ];
  const canCompare = friendCols.length > 0;

  return (
    <div className="friends">
      <header className="app-bar">
        <Link to="/" className="icon-btn" aria-label="Back to menu">
          ←
        </Link>
        <h1>Friends</h1>
      </header>

      <div className="friends-body">
        {!CLOUD_SYNC_ENABLED && (
          <section className="stats-section">
            <p className="sync-note">
              Friends need cloud sync, which is off in this build. Set
              VITE_API_BASE_URL to enable it.
            </p>
          </section>
        )}

        <section className="stats-section">
          <h2>Your profile</h2>
          <label className="field-label" htmlFor="display-name">
            Display name
          </label>
          <div className="field-row">
            <input
              id="display-name"
              className="text-input"
              type="text"
              maxLength={24}
              placeholder="Pick a name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
            />
            <button
              className="btn-primary sm"
              onClick={saveName}
              disabled={nameDraft.trim() === profile.displayName}
            >
              Save
            </button>
          </div>

          <p className="field-label" style={{ marginTop: 16 }}>
            Your friend code
          </p>
          {profile.friendCode ? (
            <>
              <p className="friend-code">{profile.friendCode}</p>
              <div className="field-row">
                <button className="icon-btn" onClick={onCopyCode}>
                  Copy
                </button>
                <button className="icon-btn" onClick={onShareCode}>
                  Share invite
                </button>
              </div>
            </>
          ) : (
            <p className="sync-note">
              Save a display name to get your shareable friend code.
            </p>
          )}
        </section>

        <section className="stats-section">
          <h2>Add a friend</h2>
          <div className="field-row">
            <input
              className="text-input"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              placeholder="XXXX-XXXX"
              value={codeInput}
              onChange={(e) => {
                setCodeInput(e.target.value);
                setAddError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onAdd();
              }}
            />
            <button
              className="btn-primary sm"
              onClick={() => void onAdd()}
              disabled={adding || !CLOUD_SYNC_ENABLED}
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
          {addError && <p className="field-error">{addError}</p>}
          <p className="sync-note">
            Ask a friend for their code (on their Friends screen) and enter it
            here to compare stats.
          </p>
        </section>

        {profile.friends.length > 0 && (
          <section className="stats-section">
            <h2>Your friends</h2>
            <ul className="friend-list">
              {profile.friends.map((f) => (
                <li key={f.code} className="friend-item">
                  <div className="friend-meta">
                    <span className="friend-name">{label(f)}</span>
                    <span className="friend-code-sm">{f.code}</span>
                  </div>
                  <div className="friend-status">
                    {loadingCodes.has(f.code) ? (
                      <span className="sync-note">Loading…</span>
                    ) : remote[f.code] === null ? (
                      <span className="sync-note">No profile yet</span>
                    ) : null}
                    <button
                      className="link-btn"
                      onClick={() => onRemove(f.code)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {canCompare && (
          <section className="stats-section">
            <h2>Compare</h2>
            <div className="compare-scroll">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th />
                    {headerNames.map((n, i) => (
                      <th key={i} className={i === 0 ? "me-col" : ""}>
                        {n}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => {
                    const lead = leaderIndex(row, columns);
                    return (
                      <tr key={row.label}>
                        <td className="row-label">{row.label}</td>
                        {columns.map((p, i) => (
                          <td
                            key={i}
                            className={lead === i ? "leader" : ""}
                          >
                            {row.value(p)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {toast && <div className="home-toast">{toast}</div>}
    </div>
  );
}
