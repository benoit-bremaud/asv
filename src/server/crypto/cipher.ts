/**
 * Field cipher, keyed hash and vault sealer of ADR-0017 (`platform/04d`, BR-083). The domain never sees
 * their output: the hub applies them between the domain and the stores.
 */
import { fromBase64, toBase64Url, type CryptoKeys } from "./keys";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const IV_BYTES = 12;
const VAULT_INFO = encoder.encode("asv-vault-v1");

/** What the hub uses to protect stored values. */
export interface Crypto {
  /** AES-256-GCM with the current key; `context` (record id and field) is bound as additional data. */
  encrypt(value: string, context: string): Promise<string>;
  /** Throws on an unknown key version, a changed context or a tampered value. */
  decrypt(sealed: string, context: string): Promise<string>;
  /** HMAC-SHA-256, base64url: lookups without the clear value. */
  keyedHash(value: string): Promise<string>;
  /** Encrypts to the owner public key; the application cannot open the result. */
  seal(value: string): Promise<string>;
}

const iv = (): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(IV_BYTES));

/** Derives the one-off AES key of a sealed value from an ECDH shared secret (HKDF-SHA-256). */
export const vaultAesKey = async (privateKey: CryptoKey, publicKey: CryptoKey, usage: KeyUsage): Promise<CryptoKey> => {
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  const hkdf = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: VAULT_INFO },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
};

/** Builds the hub's crypto from loaded keys. */
export const createCrypto = (keys: CryptoKeys): Crypto => ({
  async encrypt(value, context) {
    const nonce = iv();
    const key = keys.dataKeys.get(keys.currentVersion);
    /* v8 ignore next -- invariant: currentVersion is the highest key of the map. */
    if (!key) throw new Error("crypto invariant: no current data key");
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: encoder.encode(context) }, key, encoder.encode(value));
    return `v${keys.currentVersion}.${toBase64Url(nonce)}.${toBase64Url(new Uint8Array(data))}`;
  },

  async decrypt(sealed, context) {
    const [version, nonce, data] = sealed.split(".");
    const key = keys.dataKeys.get(Number(version?.slice(1)));
    if (!version?.startsWith("v") || !key || !nonce || !data) throw new Error("unknown key version or malformed value");
    const clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(nonce), additionalData: encoder.encode(context) },
      key,
      fromBase64(data),
    );
    return decoder.decode(clear);
  },

  async keyedHash(value) {
    return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", keys.hmacKey, encoder.encode(value))));
  },

  async seal(value) {
    const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const key = await vaultAesKey(ephemeral.privateKey, keys.vaultPublicKey, "encrypt");
    const nonce = iv();
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, encoder.encode(value));
    const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
    return `e1.${toBase64Url(publicRaw)}.${toBase64Url(nonce)}.${toBase64Url(new Uint8Array(data))}`;
  },
});
