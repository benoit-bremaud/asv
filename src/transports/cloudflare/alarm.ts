/** The one alarm of the Hub Durable Object (BR-110), as pure functions. */
import { STATEMENT_RETRY_MS } from "../../server/moderation-mail";

/** The daily purge (BR-060 to BR-062, BR-081, BR-082, BR-105). */
export const PURGE_EVERY_MS = 24 * 60 * 60_000;

/** Is the daily purge due at `nowMs`, given the last one (`undefined`: never ran)? */
export const purgeDue = (nowMs: number, lastPurgeMs: number | undefined): boolean =>
  lastPurgeMs === undefined || nowMs - lastPurgeMs >= PURGE_EVERY_MS;

/**
 * BR-110: the next alarm, at the earliest of the next retry round (10 minutes from now while a mail is
 * pending) and the next daily purge; never in the past.
 */
export const nextAlarmAt = (nowMs: number, lastPurgeMs: number, pendingMail: boolean): number => {
  const purge = lastPurgeMs + PURGE_EVERY_MS;
  const next = pendingMail ? Math.min(nowMs + STATEMENT_RETRY_MS, purge) : purge;
  return Math.max(next, nowMs + 1000);
};
