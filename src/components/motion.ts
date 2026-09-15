// Shared animation config so all card motion feels consistent.
import type { Transition } from "framer-motion";

// Fast and subtle: responsive, not sluggish.
export const CARD_TRANSITION: Transition = {
  type: "spring",
  stiffness: 700,
  damping: 42,
  mass: 0.7,
};

export const FLIP_TRANSITION: Transition = {
  duration: 0.22,
  ease: "easeOut",
};
