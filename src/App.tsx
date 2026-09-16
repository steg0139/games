import { Outlet } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import InstallPrompt from "./components/InstallPrompt";
import UpdatePrompt from "./components/UpdatePrompt";

export default function App() {
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
