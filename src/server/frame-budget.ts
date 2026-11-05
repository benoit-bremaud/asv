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
export type PolicyReason = "tooManyFrames" | "invalidFrames";

/** One bucket per socket. */
export interface FrameBudget {
  /** Consumes one token; false, consuming nothing, when the bucket is empty (the socket must close). */
  take(nowMs: number): boolean;
}

/**
 * A full bucket for one socket. `startMs` and every `nowMs` are epoch milliseconds from the caller's clock;
 * a clock stepping back refills nothing and never drains the bucket.
 */
export const createFrameBudget = (startMs: number): FrameBudget => {
  let tokens: number = FRAME_LIMITS.burst;
  let last = startMs;
  return {
    take(nowMs) {
      const elapsed = Math.max(0, nowMs - last);
      tokens = Math.min(FRAME_LIMITS.burst, tokens + (elapsed / 1000) * FRAME_LIMITS.perSecond);
      last = nowMs;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
};
