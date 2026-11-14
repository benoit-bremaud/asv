import { createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { CodeRandom } from "../../domain";

/** Domain separation: the device-token key is derived from `ASV_HMAC_KEY`, never used as is. */
const DEVICE_TOKEN_INFO = "asv-device-token-v1";

/**
 * Session ids, resume and device tokens, and sign-in codes on Cloudflare (`node:crypto` through the
 * `nodejs_compat` flag). Unlike Node, whose key dies with the process, tokens are hashed with a key derived
 * from `ASV_HMAC_KEY`: device records live in SQLite, so a member signs back in through the device cookie
 * after a deploy (BR-073, BR-109).
 */
export const createCloudflareRandom = (hmacKey: Uint8Array): CodeRandom & { hashToken(value: string): string } => {
  const key = createHmac("sha256", hmacKey).update(DEVICE_TOKEN_INFO).digest();
  const hashToken = (value: string) => createHmac("sha256", key).update(value).digest("base64url");
  return {
    id: () => randomUUID(),
    token: () => {
      const value = randomBytes(32).toString("base64url");
      return { value, hash: hashToken(value) };
    },
    code: () => randomInt(0, 1_000_000).toString().padStart(6, "0"),
    hashToken,
  };
};
