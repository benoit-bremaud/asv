import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * The pure domain imports only its own relative modules (ADR-0002, `platform/03-component`).
 * Any bare specifier (package, `node:*` or bare built-in such as `fs`) is refused.
 */
const domainForbidden = [
  { regex: "^[^.]", message: "src/domain is pure: no package or Node import." },
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
    // Domain tests may import the test runner, nothing else.
    files: ["src/domain/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ ...domainForbidden[0], regex: "^(?!vitest$)[^.]" }, domainForbidden[1]] }],
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
