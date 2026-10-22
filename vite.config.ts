import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export const config = defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: { name: "node", environment: "node", include: ["src/{domain,server,shared}/**/*.test.ts", "test/**/*.test.ts"] },
      },
      {
        extends: true,
        test: { name: "web", environment: "jsdom", include: ["src/web/**/*.test.tsx"] },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/web/main.tsx"],
      reporter: ["text", "lcov"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});

// Vite and Vitest load the config file's default export; the framework imposes it.
export default config;
