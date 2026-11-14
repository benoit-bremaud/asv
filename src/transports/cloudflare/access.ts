/**
 * Cloudflare Access JWT check of the Worker (BR-113, defence in depth behind Access): RS256 signature against
 * the team's JWKS, issuer, audience and expiry. WebCrypto only; the JWKS is cached per isolate.
 */
import { fromBase64 } from "../../server/crypto/keys";

/** The header Access adds to every request it lets through. */
export const ACCESS_HEADER = "cf-access-jwt-assertion";

/** The JWKS is fetched again after this long, or sooner for an unknown key id (rotation). */
export const JWKS_TTL_MS = 60 * 60_000;
/** At most one refetch for an unknown key id in this window, so forged ids cannot flood the JWKS endpoint. */
export const JWKS_MIN_REFETCH_MS = 60_000;

/** Why a token is refused: `invalid` answers 401, `audience` 403. */
export type AccessVerdict = "ok" | "invalid" | "audience";

interface Jwk {
  readonly kid?: string;
  readonly kty: string;
  readonly n?: string;
  readonly e?: string;
}

interface CachedKeys {
  readonly keys: readonly Jwk[];
  readonly fetchedAt: number;
}

const decoder = new TextDecoder();

const decodeJson = (part: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = JSON.parse(decoder.decode(fromBase64(part)));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

const isJwk = (value: unknown): value is Jwk =>
  typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).kty === "string";

/** The issuer of the team's tokens, from `ASV_ACCESS_TEAM_DOMAIN` (`<team>.cloudflareaccess.com`). */
export const accessIssuer = (teamDomain: string): string => `https://${teamDomain}`;

/** A verifier bound to one team; `fetch` and `now` are injected in tests. */
export const createAccessVerifier = (options: { readonly teamDomain: string; readonly fetch?: typeof fetch; readonly now?: () => number }) => {
  const issuer = accessIssuer(options.teamDomain);
  const certsUrl = `${issuer}/cdn-cgi/access/certs`;
  const now = options.now ?? Date.now;
  const fetchJwks = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  let cached: CachedKeys | undefined;

  const loadKeys = async (): Promise<readonly Jwk[]> => {
    const response = await fetchJwks(certsUrl);
    if (!response.ok) throw new Error(`Access JWKS answered ${response.status}`);
    const body: unknown = await response.json();
    const keys = typeof body === "object" && body !== null && Array.isArray((body as Record<string, unknown>).keys) ? ((body as { keys: unknown[] }).keys) : [];
    cached = { keys: keys.filter(isJwk), fetchedAt: now() };
    return cached.keys;
  };

  /** The key for `kid`, refetching once when the cache is stale or does not know it. */
  const keyFor = async (kid: string): Promise<Jwk | undefined> => {
    const age = cached === undefined ? Infinity : now() - cached.fetchedAt;
    let keys = cached === undefined || age >= JWKS_TTL_MS ? await loadKeys() : cached.keys;
    let key = keys.find((candidate) => candidate.kid === kid);
    if (!key && age >= JWKS_MIN_REFETCH_MS && age < JWKS_TTL_MS) {
      keys = await loadKeys();
      key = keys.find((candidate) => candidate.kid === kid);
    }
    return key;
  };

  /** Checks `token` for `audience`; a JWKS fetch failure counts as `invalid` (fail closed). */
  const verify = async (token: string | undefined, audience: string): Promise<AccessVerdict> => {
    const parts = token?.split(".") ?? [];
    const [headerPart, payloadPart, signaturePart] = parts;
    if (parts.length !== 3 || !headerPart || !payloadPart || !signaturePart) return "invalid";
    const header = decodeJson(headerPart);
    const payload = decodeJson(payloadPart);
    if (header?.alg !== "RS256" || typeof header.kid !== "string" || !payload) return "invalid";
    try {
      const jwk = await keyFor(header.kid);
      if (!jwk || jwk.kty !== "RSA") return "invalid";
      const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
      if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromBase64(signaturePart), signed))) return "invalid";
    } catch {
      return "invalid";
    }
    const seconds = now() / 1000;
    if (payload.iss !== issuer || typeof payload.exp !== "number" || payload.exp <= seconds) return "invalid";
    if (typeof payload.nbf === "number" && payload.nbf > seconds) return "invalid";
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    return audiences.includes(audience) ? "ok" : "audience";
  };

  return { verify };
};

export type AccessVerifier = ReturnType<typeof createAccessVerifier>;
