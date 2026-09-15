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
  /** Delay (seconds) before the entrance animation plays. For staggered deals. */
  entranceDelay?: number;
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
  entranceDelay = 0,
}: Props) {
  const color = cardColor(card.suit);

  // The outer element owns position/layout (and framer-motion layout anim).
  // The inner element performs the 3D flip based on faceUp.
  // layoutId === null explicitly opts out of shared-layout tracking.
  const resolvedLayoutId =
    layoutId === null ? undefined : (layoutId ?? card.id);

  const layoutProps = animate
    ? {
        layout: true as const,
        ...(resolvedLayoutId ? { layoutId: resolvedLayoutId } : {}),
        // Without an entrance, force first mount to be treated as a
        // shared-layout follow (FLIP) rather than an enter. This is what makes
        // a card arriving on a foundation (which renders only its top card)
        // tween from its source pile instead of teleporting.
        ...(entrance ? {} : { initial: false as const }),
      }
    : {};

  const entranceProps = entrance
    ? {
        initial: { opacity: 0, scale: 0.85, y: -12 },
        animate: { opacity: 1, scale: 1, y: 0 },
      }
    : {};

  // Keep layout (position) moves on the snappy spring regardless of any
  // entrance delay; only the entrance's opacity/scale/y carries the delay.
  const transition = {
    layout: CARD_TRANSITION,
    default: entrance
      ? { ...CARD_TRANSITION, delay: entranceDelay }
      : CARD_TRANSITION,
  };

  return (
    <motion.div
      {...layoutProps}
      {...entranceProps}
      transition={transition}
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
