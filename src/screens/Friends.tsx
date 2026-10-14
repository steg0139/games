import { useCallback, useEffect, useMemo, useState } from "react";
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
import { type Friend, type PublicProfile, toPublicProfile } from "../lib/stats/types";
import { COMPARE_GAMES, type CompareGame, rankByStat } from "../lib/stats/compare";
import "./Friends.css";

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
  // Leaderboard navigation: which game tab + which stat sub-tab.
  const [gameTab, setGameTab] = useState<CompareGame>("solitaire");
  const [statId, setStatId] = useState<string>(COMPARE_GAMES[0].stats[0].id);

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

  // Players in the leaderboard: you (always) plus every friend whose public
  // profile we've fetched.
  const me = toPublicProfile(profile);
  const myCode = profile.friendCode;
  const friendCols = profile.friends
    .map((f) => remote[f.code])
    .filter((p): p is PublicProfile => !!p);
  const players: PublicProfile[] = [me, ...friendCols];
  const canCompare = friendCols.length > 0;

  const activeGame =
    COMPARE_GAMES.find((g) => g.id === gameTab) ?? COMPARE_GAMES[0];
  const activeStat =
    activeGame.stats.find((s) => s.id === statId) ?? activeGame.stats[0];

  // Switch game tab: default its stat sub-tab to the first stat.
  const selectGame = useCallback((game: CompareGame) => {
    setGameTab(game);
    const g = COMPARE_GAMES.find((x) => x.id === game);
    if (g) setStatId(g.stats[0].id);
  }, []);

  const ranked = useMemo(
    () => rankByStat(activeStat, players),
    // players is derived from profile + remote each render; key on their codes
    // and the active stat so we recompute only when they actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeStat, profile, remote],
  );

  const nameFor = (p: PublicProfile): string =>
    p.code === myCode ? profile.displayName || "You" : p.displayName || "Player";

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
            <h2>Leaderboard</h2>

            {/* Game tabs */}
            <div className="lb-tabs" role="tablist" aria-label="Game">
              {COMPARE_GAMES.map((g) => (
                <button
                  key={g.id}
                  role="tab"
                  aria-selected={g.id === gameTab}
                  className={`lb-tab ${g.id === gameTab ? "active" : ""}`}
                  onClick={() => selectGame(g.id)}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {/* Stat sub-tabs for the active game */}
            <div className="lb-subtabs" role="tablist" aria-label="Stat">
              {activeGame.stats.map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={s.id === activeStat.id}
                  className={`lb-subtab ${s.id === activeStat.id ? "active" : ""}`}
                  onClick={() => setStatId(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Ranked rows: rank · name · value */}
            <ol className="lb-list">
              {ranked.map((entry, i) => (
                <li
                  key={entry.profile.code || i}
                  className={`lb-row ${entry.profile.code === myCode ? "me" : ""}`}
                >
                  <span className="lb-rank">{entry.noData ? "—" : i + 1}</span>
                  <span className="lb-name">{nameFor(entry.profile)}</span>
                  <span className={`lb-value ${entry.noData ? "muted" : ""}`}>
                    {entry.value}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {toast && <div className="home-toast">{toast}</div>}
    </div>
  );
}
