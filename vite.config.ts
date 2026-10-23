import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export const config = defineConfig({
  plugins: [react()],
  // The Node transport serves the WebSocket and the API in development (`platform/02`).
  server: {
    // Coverage reports are written during `pnpm verify`; watching them reloads open pages.
    watch: { ignored: ["**/coverage/**"] },
    proxy: {
      "/ws": { target: "ws://127.0.0.1:8787", ws: true },
      "/api": "http://127.0.0.1:8787",
      "/account": "http://127.0.0.1:8787",
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "node", environment: "node", include: ["src/{domain,server,shared,transports}/**/*.test.ts", "test/**/*.test.ts"] },
      },
      {
        extends: true,
        test: { name: "web", environment: "jsdom", include: ["src/web/**/*.test.{ts,tsx}"] },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/web/main.tsx", "src/transports/node/main.ts"],
      reporter: ["text", "lcov"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});

// Vite and Vitest load the config file's default export; the framework imposes it.
export default config;
