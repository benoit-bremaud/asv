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

/** Close code and reasons sent when a socket breaks BR-088. */
export const POLICY_CLOSE = 1008;
export type PolicyReason = "tooManyFrames" | "invalidFrames";

/** One bucket per socket; `take` returns false once the socket must be closed. */
export interface FrameBudget {
  take(nowMs: number): boolean;
}

export const createFrameBudget = (startMs: number, limits = FRAME_LIMITS): FrameBudget => {
  let tokens: number = limits.burst;
  let last = startMs;
  return {
    take(nowMs) {
      tokens = Math.min(limits.burst, tokens + ((nowMs - last) / 1000) * limits.perSecond);
      last = nowMs;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
};
