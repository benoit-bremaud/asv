/**
 * Pure domain (ADR-0002). Imports nothing outside `src/domain`;
 * the rule is enforced by ESLint (`platform/03-component`).
 */
export * from "./entry";
export * from "./pseudo";
export * from "./rooms";
// Shadow the entry versions: closing a session must also leave its rooms (`rooms/07`).
export { expireAway, leave, type HubResult } from "./hub";
