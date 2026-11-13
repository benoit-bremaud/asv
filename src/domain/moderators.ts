/**
 * Moderator names and limits of brick 8b (`moderation/02f`, BR-056, BR-094 to BR-096).
 */

export const MODERATOR_LIMITS = {
  /** BR-056. */
  invitationTtlMs: 24 * 60 * 60_000,
  /** BR-095. */
  grantTtlMs: 60_000,
  /** BR-096. */
  challengeTtlMs: 5 * 60_000,
  maxPendingChallenges: 200,
} as const;

const NAME = /^[A-Za-z0-9_-]{2,20}$/;

/** BR-094: 2 to 20 characters among `A-Z a-z 0-9 _ -`. */
export const isModeratorName = (name: string): boolean => NAME.test(name);

/** BR-094: names compare case-insensitively. */
export const foldModeratorName = (name: string): string => name.toLowerCase();
