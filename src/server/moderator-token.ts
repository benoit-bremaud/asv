/**
 * Interim moderator access of brick 8a (BR-091, `moderation/02e`), removed by brick 8b (passkeys, ADR-0008).
 */

/** BR-091: shorter tokens are refused at start-up. */
export const MIN_MODERATOR_TOKEN_LENGTH = 32;

const digest = async (value: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));

/** The digest the hub keeps, or `undefined` when no token is set; throws on a weak token or in tunnel mode. */
export const moderatorTokenDigest = async (token: string | undefined, tunnel: boolean): Promise<Uint8Array | undefined> => {
  if (token === undefined || token === "") return undefined;
  if (tunnel) throw new Error("ASV_MODERATOR_TOKEN must not be set with ASV_TUNNEL=1 (BR-091)");
  if (token.length < MIN_MODERATOR_TOKEN_LENGTH)
    throw new Error(`ASV_MODERATOR_TOKEN needs at least ${MIN_MODERATOR_TOKEN_LENGTH} characters (BR-091)`);
  return digest(token);
};

/** Compares fixed-length digests in constant time, so timing reveals nothing about the token. */
export const matchesModeratorToken = async (expected: Uint8Array | undefined, grant: string): Promise<boolean> => {
  if (!expected) return false;
  const given = await digest(grant);
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= (expected[index] ?? 0) ^ (given[index] ?? 0);
  return diff === 0;
};
