/** WebSocket upgrade limits per IP and in total (BR-089, `platform/02`), checked before any socket exists. */

import { createTokenBucket, type TokenBucket } from "./token-bucket";

/** BR-089 limits; shared by every transport. */
export const UPGRADE_LIMITS = {
  /** Open sockets per client IP. */
  perIp: 20,
  /** Open sockets in total. */
  total: 500,
  /** Upgrade tokens a full bucket holds, per IP. */
  burst: 20,
  /** Upgrade tokens added back per second, per IP. */
  perSecond: 1,
  /** Seconds sent in `Retry-After` with a refusal. */
  retryAfterSeconds: 10,
  /** A socket without a session for this long is closed with 1008 `unbound`. */
  unboundMs: 10 * 60_000,
} as const;

/** `perIp` and `rate` answer 429, `total` answers 503. */
export type UpgradeVerdict = "ok" | "perIp" | "total" | "rate";

export interface UpgradeLimiter {
  /** Takes an upgrade token, refused or not; on `ok` counts one more open socket for `ip`. */
  admit(ip: string, nowMs: number): UpgradeVerdict;
  /** Gives back the place of one socket `admit` let through; call it once, when that socket closes. */
  release(ip: string): void;
  /** Drops the buckets that are full again and have no open socket. */
  prune(nowMs: number): void;
}

interface IpEntry {
  readonly bucket: TokenBucket;
  open: number;
}

export const createUpgradeLimiter = (): UpgradeLimiter => {
  const ips = new Map<string, IpEntry>();
  let total = 0;
  return {
    admit(ip, nowMs) {
      let entry = ips.get(ip);
      if (!entry) {
        entry = { bucket: createTokenBucket(UPGRADE_LIMITS.burst, UPGRADE_LIMITS.perSecond, nowMs), open: 0 };
        ips.set(ip, entry);
      }
      if (!entry.bucket.take(nowMs)) return "rate";
      if (entry.open >= UPGRADE_LIMITS.perIp) return "perIp";
      if (total >= UPGRADE_LIMITS.total) return "total";
      entry.open += 1;
      total += 1;
      return "ok";
    },
    release(ip) {
      const entry = ips.get(ip);
      if (!entry || entry.open === 0) return;
      entry.open -= 1;
      total -= 1;
    },
    prune(nowMs) {
      for (const [ip, entry] of ips) if (entry.open === 0 && entry.bucket.isFull(nowMs)) ips.delete(ip);
    },
  };
};
