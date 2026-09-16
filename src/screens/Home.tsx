import { useState } from "react";
import { Link } from "react-router-dom";
import { isStandalone, shareApp } from "../lib/pwa";
import { VERSION_LABEL } from "../lib/version";
import "./Home.css";

interface GameEntry {
  to: string;
  title: string;
  blurb: string;
  suits: string;
}

const GAMES: GameEntry[] = [
  {
    to: "/solitaire",
    title: "Solitaire",
    blurb: "Classic Klondike. Build the foundations, clear the table.",
    suits: "♠ ♥",
  },
  {
    to: "/blackjack",
    title: "Blackjack",
    blurb: "Beat the dealer to 21 without going bust.",
    suits: "♦ ♣",
  },
  {
    to: "/videopoker",
    title: "Video Poker",
    blurb: "Jacks or Better. Hold, draw, and hit a paying hand.",
    suits: "♣ ♠",
  },
];

export default function Home() {
  const [toast, setToast] = useState<string | null>(null);

  const onShare = async () => {
    const result = await shareApp();
    if (result === "copied") {
      setToast("Link copied");
      setTimeout(() => setToast(null), 1800);
    } else if (result === "unavailable") {
      setToast("Couldn't share");
      setTimeout(() => setToast(null), 1800);
    }
    // "shared" uses the native sheet; no toast needed.
  };

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-title-row">
          <h1>Card Games</h1>
          <button className="share-btn" onClick={onShare} aria-label="Share">
            <span aria-hidden>↗</span> Share
          </button>
        </div>
        <p>A small, clean collection. Pick something to play.</p>
      </header>

      <nav className="game-grid">
        {GAMES.map((g) => (
          <Link key={g.to} to={g.to} className="game-card">
            <div className="game-card-suits" aria-hidden>
              {g.suits}
            </div>
            <div className="game-card-body">
              <h2>{g.title}</h2>
              <p>{g.blurb}</p>
            </div>
            <span className="game-card-go" aria-hidden>
              →
            </span>
          </Link>
        ))}
      </nav>

      <footer className="home-footer">
        <Link to="/stats" className="home-stats-link">
          Stats &amp; Settings
        </Link>
        <span>
          {isStandalone()
            ? VERSION_LABEL
            : "Add to Home Screen to play offline."}
        </span>
      </footer>

      {toast && <div className="home-toast">{toast}</div>}
    </div>
  );
}
