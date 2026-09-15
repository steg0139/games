import type { CSSProperties } from "react";
import { type Card, cardColor, suitSymbol } from "../lib/cards";
import "./PlayingCard.css";

interface Props {
  card: Card;
  style?: CSSProperties;
  className?: string;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  selected?: boolean;
}

export default function PlayingCard({
  card,
  style,
  className,
  onClick,
  onPointerDown,
  selected,
}: Props) {
  if (!card.faceUp) {
    return (
      <div
        className={`card card-back ${className ?? ""}`}
        style={style}
        onClick={onClick}
        onPointerDown={onPointerDown}
      />
    );
  }

  const color = cardColor(card.suit);
  const symbol = suitSymbol(card.suit);

  return (
    <div
      className={`card card-face ${color} ${selected ? "selected" : ""} ${
        className ?? ""
      }`}
      style={style}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <div className="corner top">
        <span className="rank">{card.rank}</span>
        <span className="suit">{symbol}</span>
      </div>
      <div className="pip">{symbol}</div>
      <div className="corner bottom">
        <span className="rank">{card.rank}</span>
        <span className="suit">{symbol}</span>
      </div>
    </div>
  );
}
