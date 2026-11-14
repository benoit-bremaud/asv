/** Test fixtures of the Cloudflare transport: a valid environment and Access tokens signed by a local RSA key. */
import { toBase64Url } from "../../server/crypto/keys";
import type { Env, Fetcher, HubNamespace } from "./env";

const encoder = new TextEncoder();
const random = (length: number) => crypto.getRandomValues(new Uint8Array(length));

export const TEAM = "asv-test.cloudflareaccess.com";
export const AUD_SITE = "aud-site";
export const AUD_OWNER = "aud-owner";

const vaultKey = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const vaultRaw = new Uint8Array(await crypto.subtle.exportKey("raw", vaultKey.publicKey));

/** Every value BR-111 requires, valid; bindings answer from the given fetchers. */
export const validEnv = (overrides: Partial<Env> = {}, hub?: Fetcher, assets?: Fetcher): Env => {
  const unused: Fetcher = { fetch: () => Promise.reject(new Error("unexpected fetch")) };
  const namespace: HubNamespace = { jurisdiction: () => namespace, idFromName: (name) => name, get: () => hub ?? unused };
  return {
    ASSETS: assets ?? unused,
    HUB: namespace,
    ASV_DATA_KEYS: `1:${toBase64Url(random(32))}`,
    ASV_HMAC_KEY: toBase64Url(random(32)),
    ASV_VAULT_PUBLIC_KEY: toBase64Url(vaultRaw),
    ASV_OWNER_SECRET: "o".repeat(32),
    BREVO_API_KEY: "brevo",
    ASV_PUBLIC_ORIGIN: "https://staging.asvchat.fr",
    ASV_ALLOWED_ORIGINS: "https://staging.asvchat.fr, https://asvchat.fr",
    ASV_ACCESS_AUD_SITE: AUD_SITE,
    ASV_ACCESS_AUD_OWNER: AUD_OWNER,
    ASV_ACCESS_TEAM_DOMAIN: TEAM,
    ASV_MODERATION: "on",
    ...overrides,
  };
};

/** A local RSA signer standing in for Access, and the JWKS `fetch` serving its public key. */
export const createSigner = async (kid = "k1") => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const sign = async (payload: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256", kid }) => {
    const head = `${toBase64Url(encoder.encode(JSON.stringify(header)))}.${toBase64Url(encoder.encode(JSON.stringify(payload)))}`;
    const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, encoder.encode(head)));
    return `${head}.${toBase64Url(signature)}`;
  };
  return { jwk: { kid, kty: "RSA", n: jwk.n, e: jwk.e }, sign };
};

/** Claims Access would issue for `aud`, valid for an hour around `nowMs`. */
export const claims = (aud: string | string[], nowMs = Date.now()) => ({
  iss: `https://${TEAM}`,
  aud,
  exp: Math.floor(nowMs / 1000) + 3600,
  nbf: Math.floor(nowMs / 1000) - 60,
});

/** A JWKS endpoint serving `keys`, counting its calls. */
export const jwksServer = (keys: () => unknown[]) => {
  const calls: string[] = [];
  const fetcher = (input: RequestInfo | URL) => {
    calls.push(String(input));
    return Promise.resolve(Response.json({ keys: keys() }));
  };
  return { calls, fetch: fetcher as typeof fetch };
};
