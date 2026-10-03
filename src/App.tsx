import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import InstallPrompt from "./components/InstallPrompt";
import UpdatePrompt from "./components/UpdatePrompt";
import { prefetchTodaysPuzzle } from "./games/crossword/client";
import { prefetchTodaysSudoku } from "./games/sudoku/client";
import { prefetchTodaysWordSearch } from "./games/wordsearch/client";

export default function App() {
  // Prefetch today's daily puzzles on app open so they're cached and ready
  // (and work offline) by the time the player opens them — each is small.
  useEffect(() => {
    prefetchTodaysPuzzle();
    prefetchTodaysSudoku();
    prefetchTodaysWordSearch();
  }, []);

  // `reducedMotion="user"` makes framer-motion honor the OS
  // "reduce motion" accessibility setting for all animations.
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <Outlet />
      </div>
      <InstallPrompt />
      <UpdatePrompt />
    </MotionConfig>
  );
}
