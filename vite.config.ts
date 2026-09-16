import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json";

// Short git SHA of the build, with a safe fallback if git isn't available.
function gitShortSha(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

// Release index for the codename. Set by CI (one bump per deploy, from the
// count of release-* git tags); falls back to 0 ("Apple") for local builds.
function releaseIndex(): number {
  const n = Number(process.env.RELEASE_INDEX);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_SHA__: JSON.stringify(gitShortSha()),
    __APP_RELEASE__: JSON.stringify(releaseIndex()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Card Games",
        short_name: "Cards",
        description: "A clean collection of simple card games.",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
});
