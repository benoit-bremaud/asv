/**
 * Key material of ADR-0017, read from the environment (`platform/04d`). WebCrypto only, so the same code
 * runs on Node and Cloudflare Workers.
 */

/** Data keys by version (the highest encrypts), the HMAC key and the owner's vault public key. */
export interface CryptoKeys {
  readonly dataKeys: ReadonlyMap<number, CryptoKey>;
  readonly currentVersion: number;
  readonly hmacKey: CryptoKey;
  readonly vaultPublicKey: CryptoKey;
}

/** Variables read by {@link cryptoKeysFromEnv}; all are secrets in production. */
export interface CryptoEnv {
  /** `version:base64key` pairs separated by commas, 32-byte AES keys. */
  readonly ASV_DATA_KEYS?: string;
  /** Base64, at least 32 bytes. */
  readonly ASV_HMAC_KEY?: string;
  /** Owner ECDH P-256 public key, base64 of the raw (uncompressed) point. */
  readonly ASV_VAULT_PUBLIC_KEY?: string;
}

/** Unpadded base64url, the encoding of every ciphertext, hash and sealed value. */
export const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

/** Decodes base64 or base64url, padded or not. @throws on characters outside both alphabets. */
export const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
};

const importAes = (raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> => {
  if (raw.length !== 32) throw new Error("ASV_DATA_KEYS: each key must be 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
};

const importHmac = (raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> => {
  if (raw.length < 32) throw new Error("ASV_HMAC_KEY must be at least 32 bytes");
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
};

/** Imports the owner's raw P-256 public key. */
export const importVaultPublicKey = (raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> =>
  crypto.subtle.importKey("raw", raw, { name: "ECDH", namedCurve: "P-256" }, true, []);

const parseDataKeys = async (value: string): Promise<Map<number, CryptoKey>> => {
  const seen = new Set<number>();
  const pairs = value.split(",").map((pair) => {
    const [version, key] = pair.trim().split(":");
    const number = Number(version);
    if (!Number.isInteger(number) || number < 1 || !key || seen.has(number)) {
      throw new Error("ASV_DATA_KEYS must be version:base64key pairs with distinct positive versions");
    }
    seen.add(number);
    return [number, key] as const;
  });
  const imported = await Promise.all(pairs.map(async ([number, key]) => [number, await importAes(fromBase64(key))] as const));
  return new Map(imported);
};

const randomBytes = (length: number): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(length));

/**
 * Production refuses to start without every key. Development generates the missing ones for the process
 * lifetime and calls `warn`: values then die with the process, like the in-memory stores.
 */
export const cryptoKeysFromEnv = async (env: CryptoEnv, production: boolean, warn: (text: string) => void): Promise<CryptoKeys> => {
  const missing = (["ASV_DATA_KEYS", "ASV_HMAC_KEY", "ASV_VAULT_PUBLIC_KEY"] as const).filter((name) => !env[name]);
  if (missing.length > 0) {
    if (production) throw new Error(`missing secrets: ${missing.join(", ")}`);
    warn(`crypto keys generated for this process only: ${missing.join(", ")} not set (development)`);
  }
  const dataKeys = env.ASV_DATA_KEYS ? await parseDataKeys(env.ASV_DATA_KEYS) : new Map([[1, await importAes(randomBytes(32))]]);
  const hmacKey = await importHmac(env.ASV_HMAC_KEY ? fromBase64(env.ASV_HMAC_KEY) : randomBytes(32));
  const vaultPublicKey = env.ASV_VAULT_PUBLIC_KEY
    ? await importVaultPublicKey(fromBase64(env.ASV_VAULT_PUBLIC_KEY))
    : (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])).publicKey;
  return { dataKeys, currentVersion: Math.max(...dataKeys.keys()), hmacKey, vaultPublicKey };
};
