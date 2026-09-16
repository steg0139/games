import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import App from "./App";
import Home from "./screens/Home";
import SolitaireScreen from "./games/solitaire/SolitaireScreen";
import BlackjackScreen from "./games/blackjack/BlackjackScreen";
import VideoPokerScreen from "./games/videopoker/VideoPokerScreen";
import Stats from "./screens/Stats";
import "./styles/global.css";

// Crossword pulls in react-crossword, styled-components, and a large puzzle
// data file. Lazy-load it so it doesn't weigh down the initial app load.
const CrosswordScreen = lazy(() => import("./games/crossword/CrosswordScreen"));

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: "solitaire", element: <SolitaireScreen /> },
      { path: "blackjack", element: <BlackjackScreen /> },
      { path: "videopoker", element: <VideoPokerScreen /> },
      {
        path: "crossword",
        element: (
          <Suspense fallback={<div className="route-loading">Loading…</div>}>
            <CrosswordScreen />
          </Suspense>
        ),
      },
      { path: "stats", element: <Stats /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
