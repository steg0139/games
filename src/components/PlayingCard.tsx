import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import { type Card, cardColor, suitSymbol } from "../lib/cards";
import { CARD_TRANSITION, FLIP_TRANSITION } from "./motion";
import "./PlayingCard.css";

interface Props {
  card: Card;
  style?: CSSProperties;
  className?: string;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  selected?: boolean;
  /** Enable framer-motion layout animation (movement between parents). */
  animate?: boolean;
  /**
   * Shared id so the same card tweens across different piles. Defaults to
   * card.id. Pass `null` to opt out of cross-parent layout tracking (needed
   * where the same card id can appear more than once, e.g. a multi-deck shoe).
   */
  layoutId?: string | null;
  /** Animate the card in (scale/fade). Good for dealt hands. */
  entrance?: boolean;
}

function FaceContent({ card }: { card: Card }) {
  const symbol = suitSymbol(card.suit);
  return (
    <>
      <div className="corner top">
        <span className="rank">{card.rank}</span>
        <span className="suit">{symbol}</span>
      </div>
      <div className="pip">{symbol}</div>
      <div className="corner bottom">
        <span className="rank">{card.rank}</span>
        <span className="suit">{symbol}</span>
      </div>
    </>
  );
}

export default function PlayingCard({
  card,
  style,
  className,
  onClick,
  onPointerDown,
  selected,
  animate = false,
  layoutId,
  entrance = false,
}: Props) {
  const color = cardColor(card.suit);

  // The outer element owns position/layout (and framer-motion layout anim).
  // The inner element performs the 3D flip based on faceUp.
  // layoutId === null explicitly opts out of shared-layout tracking.
  const resolvedLayoutId =
    layoutId === null ? undefined : (layoutId ?? card.id);

  const outerProps = animate
    ? {
        layout: true as const,
        ...(resolvedLayoutId ? { layoutId: resolvedLayoutId } : {}),
        transition: CARD_TRANSITION,
      }
    : {};

  const entranceProps = entrance
    ? {
        initial: { opacity: 0, scale: 0.85, y: -12 },
        animate: { opacity: 1, scale: 1, y: 0 },
        transition: CARD_TRANSITION,
      }
    : {};

  return (
    <motion.div
      {...outerProps}
      {...entranceProps}
      className={`card-outer ${className ?? ""}`}
      style={style}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <motion.div
        className="card-flip"
        initial={false}
        animate={{ rotateY: card.faceUp ? 0 : 180 }}
        transition={FLIP_TRANSITION}
      >
        {/* Front (face up) */}
        <div className={`card card-face front ${color} ${selected ? "selected" : ""}`}>
          <FaceContent card={card} />
        </div>
        {/* Back (face down) */}
        <div className="card card-back back" />
      </motion.div>
    </motion.div>
  );
}
