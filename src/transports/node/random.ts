import { createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { CodeRandom } from "../../domain";

/**
 * Session ids, resume and device tokens, and sign-in codes; tokens are hashed with a key drawn at start
 * (`platform/02`), so device records die with the process like the in-memory stores (ADR-0017).
 */
export const createNodeRandom = (key: Buffer = randomBytes(32)): CodeRandom & { hashToken(value: string): string } => {
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
