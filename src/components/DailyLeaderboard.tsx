import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  type DailyBoardKey,
  type DailyResult,
  fetchDailyResults,
  rankDailyResults,
} from "../lib/stats/daily-compete";
import { CLOUD_SYNC_ENABLED } from "../lib/config";
import { useProfile } from "../lib/stats/useProfile";
import "./DailyLeaderboard.css";

// Re-poll roughly every 20s while visible so friends who finish later in the
// day appear without a manual refresh.
const REFRESH_MS = 20_000;

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

interface Props {
  board: DailyBoardKey;
  /** Show the hints column (sudoku only). */
  showHints?: boolean;
  /**
   * This device's just-finished result, shown optimistically so you appear in
   * the standings immediately — before the server round-trip. Replaced by the
   * synced copy once the fetched results include your code.
   */
  myResult?: { timeSeconds: number; hints: number } | null;
}

/**
 * Today's friend standings for one daily board. Fetches this device + its
 * friends' results, ranks by time, highlights you, and auto-refreshes so
 * late finishers show up. Shows only you and codes already in your friends
 * list — no strangers.
 */
export default function DailyLeaderboard({
  board,
  showHints = false,
  myResult = null,
}: Props) {
  const profile = useProfile();
  const myCode = profile.friendCode;
  const [results, setResults] = useState<DailyResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stable list of codes to query: you + every friend.
  const codes = [myCode, ...profile.friends.map((f) => f.code)].filter(Boolean);
  const codesKey = codes.join(",");
  // Serialize the board so the effect re-runs when the board changes.
  const boardKey = `${board.game}:${board.day}:${board.variant}`;

  const refresh = useCallback(async () => {
    const data = await fetchDailyResults(board, codes);
    if (data) {
      setResults(data);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, codesKey]);

  useEffect(() => {
    if (!CLOUD_SYNC_ENABLED) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();

    const start = () => {
      if (timerRef.current) return;
      timerRef.current = setInterval(() => void refresh(), REFRESH_MS);
    };
    const stop = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        void refresh(); // catch up immediately on return
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  if (!CLOUD_SYNC_ENABLED) return null;

  // No friends yet: nudge toward adding some rather than showing an empty board.
  if (profile.friends.length === 0) {
    return (
      <section className="daily-board">
        <h3>Today's results</h3>
        <p className="daily-board-empty">
          Add friends to race the daily.{" "}
          <Link to="/friends">Go to Friends →</Link>
        </p>
      </section>
    );
  }

  // Merge in an optimistic "my result" when the synced data doesn't yet
  // include my row, so I show up immediately after finishing. Once the server
  // returns my row, that real entry is used instead (no duplicate).
  const serverResults = results ?? [];
  const serverHasMine = serverResults.some((r) => r.code === myCode);
  const merged =
    myResult && myCode && !serverHasMine
      ? [
          ...serverResults,
          {
            code: myCode,
            displayName: profile.displayName,
            timeSeconds: myResult.timeSeconds,
            hints: myResult.hints,
            completedAt: Date.now(),
          },
        ]
      : serverResults;

  const ranked = rankDailyResults(merged);
  const hasMine = ranked.some((r) => r.code === myCode);
  // Whether my row is still the optimistic (unsynced) one.
  const minePending = !serverHasMine && !!myResult;
  const nameFor = (code: string): string => {
    if (code === myCode) return profile.displayName || "You";
    const f = profile.friends.find((fr) => fr.code === code);
    return f?.displayName || "Player";
  };

  return (
    <section className="daily-board">
      <h3>Today's results</h3>

      {loading && ranked.length === 0 ? (
        <p className="daily-board-empty">Loading standings…</p>
      ) : ranked.length === 0 ? (
        <p className="daily-board-empty">
          No one's finished yet today. Check back later.
        </p>
      ) : (
        <ol className="daily-board-list">
          {ranked.map((r, i) => {
            const isMe = r.code === myCode;
            return (
              <li key={r.code} className={`daily-row ${isMe ? "me" : ""}`}>
                <span className="daily-rank">{i + 1}</span>
                <span className="daily-name">
                  {nameFor(r.code)}
                  {isMe && minePending && (
                    <span className="daily-syncing"> · syncing…</span>
                  )}
                </span>
                {showHints && (
                  <span className="daily-hints">
                    {r.hints === 0 ? "—" : `${r.hints} hint${r.hints === 1 ? "" : "s"}`}
                  </span>
                )}
                <span className="daily-time">{fmtTime(r.timeSeconds)}</span>
              </li>
            );
          })}
        </ol>
      )}

      {!hasMine && !loading && (
        <p className="daily-board-note">
          Your result will appear here once it syncs.
        </p>
      )}
    </section>
  );
}
