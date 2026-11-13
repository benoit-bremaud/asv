/**
 * Moderator grant of brick 8b (BR-095, `moderation/02f`): a 60-second, single-use proof that a passkey
 * sign-in succeeded, HMAC-signed under a key drawn at start and never stored.
 */
import { MODERATOR_LIMITS } from "../domain";
import { fromBase64, toBase64Url } from "./crypto/keys";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A fresh, non-extractable HMAC-SHA-256 key; a restart voids every pending grant. */
export const createGrantKey = (): Promise<CryptoKey> =>
  crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign", "verify"]);

/** What a valid grant carries. */
export interface GrantClaims {
  readonly name: string;
  readonly nonce: string;
  readonly expiresAt: number;
}

/** Signs `name` with a 128-bit random nonce, valid `grantTtlMs` from `now`. */
export const signGrant = async (key: CryptoKey, name: string, now: Date): Promise<string> => {
  const claims: GrantClaims = {
    name,
    nonce: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    expiresAt: now.getTime() + MODERATOR_LIMITS.grantTtlMs,
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  return `${body}.${toBase64Url(mac)}`;
};

const isClaims = (value: unknown): value is GrantClaims =>
  typeof value === "object" &&
  value !== null &&
  "name" in value &&
  typeof value.name === "string" &&
  "nonce" in value &&
  typeof value.nonce === "string" &&
  "expiresAt" in value &&
  typeof value.expiresAt === "number";

/** The claims of a well-signed, unexpired grant, or `undefined`; the caller checks the nonce. */
export const readGrant = async (key: CryptoKey, grant: string, now: Date): Promise<GrantClaims | undefined> => {
  const [body, mac, extra] = grant.split(".");
  if (body === undefined || mac === undefined || extra !== undefined) return undefined;
  try {
    // `verify` compares in constant time.
    if (!(await crypto.subtle.verify("HMAC", key, fromBase64(mac), encoder.encode(body)))) return undefined;
    const claims: unknown = JSON.parse(decoder.decode(fromBase64(body)));
    return isClaims(claims) && claims.expiresAt > now.getTime() ? claims : undefined;
  } catch {
    return undefined;
  }
};
