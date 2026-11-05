/** Pure token bucket shared by the frame budget (BR-088) and the upgrade budget (BR-089), `platform/04c`. */

export interface TokenBucket {
  /** Consumes one token; false, consuming nothing, when less than one token is left. */
  take(nowMs: number): boolean;
  /** True when the bucket is back to its capacity, so dropping it changes nothing. */
  isFull(nowMs: number): boolean;
}

/**
 * A full bucket. `startMs` and every `nowMs` are epoch milliseconds from the caller's clock; a clock stepping
 * back refills nothing and never drains the bucket.
 */
export const createTokenBucket = (capacity: number, perSecond: number, startMs: number): TokenBucket => {
  let tokens = capacity;
  let last = startMs;
  const refill = (nowMs: number) => {
    const elapsed = Math.max(0, nowMs - last);
    tokens = Math.min(capacity, tokens + (elapsed / 1000) * perSecond);
    last = nowMs;
  };
  return {
    take(nowMs) {
      refill(nowMs);
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
    isFull(nowMs) {
      refill(nowMs);
      return tokens >= capacity;
    },
  };
};
