import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import InstallPrompt from "./components/InstallPrompt";
import UpdatePrompt from "./components/UpdatePrompt";
import { prefetchTodaysPuzzle } from "./games/crossword/client";

export default function App() {
  // Prefetch today's crossword on app open so it's cached and ready (and works
  // offline) by the time the player opens the crossword — one small puzzle,
  // not the whole library.
  useEffect(() => {
    prefetchTodaysPuzzle();
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
