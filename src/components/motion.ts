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

// A slower, more deliberate flip for the Blackjack dealer reveal, to build a
// little suspense as the hole card and each draw turn over.
export const DEALER_FLIP_TRANSITION: Transition = {
  duration: 0.5,
  ease: "easeInOut",
};

// Delay between each dealer card during the staged reveal (ms).
export const DEALER_REVEAL_STEP_MS = 650;
