import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { Random } from "../../domain";

/** Session ids and resume tokens; tokens are hashed with a key drawn at start (`platform/02`). */
export const createNodeRandom = (key: Buffer = randomBytes(32)): Random & { hashToken(value: string): string } => {
  const hashToken = (value: string) => createHmac("sha256", key).update(value).digest("base64url");
  return {
    id: () => randomUUID(),
    token: () => {
      const value = randomBytes(32).toString("base64url");
      return { value, hash: hashToken(value) };
    },
    hashToken,
  };
};
