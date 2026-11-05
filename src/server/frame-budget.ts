import { createTokenBucket, type TokenBucket } from "./token-bucket";

/** Per-socket frame budget (BR-088, `platform/02`): a token bucket checked before any parsing. */

/** BR-088 limits; shared by every transport. */
export const FRAME_LIMITS = {
  /** Tokens a full bucket holds: the largest burst. */
  burst: 40,
  /** Tokens added back per second. */
  perSecond: 20,
  /** Invalid frames in a row that close the socket. */
  invalidInRow: 5,
} as const;

/** Close code and reasons sent when a socket breaks BR-088; the transport maps the reason to the code. */
export const POLICY_CLOSE = 1008;
/** `unbound` is BR-089: a socket left without a session. */
export type PolicyReason = "tooManyFrames" | "invalidFrames" | "unbound";

/** One bucket per socket. */
export type FrameBudget = Pick<TokenBucket, "take">;

/** A full bucket for one socket, at `startMs` epoch milliseconds from the caller's clock. */
export const createFrameBudget = (startMs: number): FrameBudget =>
  createTokenBucket(FRAME_LIMITS.burst, FRAME_LIMITS.perSecond, startMs);
