/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Injected at build time via Vite `define`.
declare const __APP_VERSION__: string;
declare const __APP_SHA__: string;
declare const __APP_RELEASE__: number;
