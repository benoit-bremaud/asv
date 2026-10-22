/**
 * Pure domain (ADR-0002). Imports nothing outside `src/domain`;
 * the rule is enforced by ESLint (`platform/03-component`).
 */
export * from "./entry";
export * from "./pseudo";
