import { Link } from "react-router-dom";
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
];

export default function Home() {
  return (
    <div className="home">
      <header className="home-header">
        <h1>Card Games</h1>
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
        <span>Add to Home Screen to play offline.</span>
      </footer>
    </div>
  );
}
