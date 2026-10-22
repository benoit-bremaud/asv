import { builtinModules } from "node:module";
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Packages and folders the pure domain must never import (ADR-0002, `platform/03-component`). */
const domainForbidden = [
  { group: ["node:*", ...builtinModules, ...builtinModules.map((name) => `${name}/*`)], message: "src/domain is pure: no Node import." },
  { group: ["ws", "hono", "hono/*", "@hono/*", "react", "react-dom", "react/*", "react-dom/*"], message: "src/domain is pure: no runtime library." },
  { group: ["cloudflare:*", "@cloudflare/*"], message: "src/domain is pure: no Cloudflare import." },
  { group: ["**/server", "**/server/**", "**/web", "**/web/**", "**/transports", "**/transports/**", "**/shared", "**/shared/**"], message: "src/domain imports nothing from other folders." },
];

const config = tseslint.config(
  // Fixtures break the rule on purpose; test/dependency-rule.test.ts lints them with ignore: false.
  { ignores: ["dist", "coverage", "test/fixtures"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { "no-restricted-exports": ["error", { restrictDefaultExports: { direct: true, named: true, defaultFrom: true, namedFrom: true, namespaceFrom: true } }] },
  },
  {
    files: ["vite.config.ts", "eslint.config.js"],
    rules: { "no-restricted-exports": "off" },
  },
  {
    files: ["src/web/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["src/domain/**/*.ts", "test/fixtures/lint/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: domainForbidden }],
      "no-restricted-globals": ["error", "process", "Buffer"],
    },
  },
  {
    files: ["src/server/**/*.ts", "test/fixtures/lint/server/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["**/transports", "**/transports/**"], message: "src/server never imports a transport." }] }],
    },
  },
  {
    files: ["src/shared/protocol/**/*.ts", "test/fixtures/lint/protocol/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: "^(?!zod/mini$|\\./[^.]).*", message: "src/shared/protocol imports only zod/mini (ADR-0015)." }] }],
    },
  },
);

// ESLint loads the flat config from the default export; the framework imposes it.
export default config;
