import { describe, expect, it, vi } from "vitest";
import { createCrypto, vaultAesKey } from "./cipher";
import { cryptoKeysFromEnv, fromBase64, importVaultPublicKey, toBase64Url, type CryptoEnv } from "./keys";

const key32 = (fill: number) => toBase64Url(new Uint8Array(32).fill(fill));

/** The owner's offline side (test fixture): opens a sealed value with the private key. */
const openSealed = async (privateKey: CryptoKey, sealed: string): Promise<string> => {
  const [, publicKey = "", nonce = "", data = ""] = sealed.split(".");
  const ephemeral = await importVaultPublicKey(fromBase64(publicKey));
  const key = await vaultAesKey(privateKey, ephemeral, "decrypt");
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(nonce) }, key, fromBase64(data));
  return new TextDecoder().decode(clear);
};

const ownerKeyPair = async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { privateKey: pair.privateKey, publicBase64: toBase64Url(raw) };
};

const env = async (overrides: Partial<CryptoEnv> = {}): Promise<CryptoEnv> => ({
  ASV_DATA_KEYS: `1:${key32(1)}`,
  ASV_HMAC_KEY: key32(9),
  ASV_VAULT_PUBLIC_KEY: (await ownerKeyPair()).publicBase64,
  ...overrides,
});

const cryptoFor = async (overrides: Partial<CryptoEnv> = {}) =>
  createCrypto(await cryptoKeysFromEnv(await env(overrides), true, () => undefined));

describe("field cipher", () => {
  it("round-trips a value, with a fresh IV each time", async () => {
    const c = await cryptoFor();

    const first = await c.encrypt("nath@example.org", "account:acc1:email");
    const second = await c.encrypt("nath@example.org", "account:acc1:email");

    expect(first).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain("nath");
    expect(await c.decrypt(first, "account:acc1:email")).toBe("nath@example.org");
  });

  it("fails on a changed context, a tampered value or an unknown version", async () => {
    const c = await cryptoFor();
    const sealed = await c.encrypt("nath@example.org", "account:acc1:email");
    const [version, nonce, data = ""] = sealed.split(".");
    const tampered = `${version}.${nonce}.${data.startsWith("A") ? "B" : "A"}${data.slice(1)}`;

    await expect(c.decrypt(sealed, "account:acc2:email")).rejects.toThrow();
    await expect(c.decrypt(tampered, "account:acc1:email")).rejects.toThrow();
    await expect(c.decrypt(sealed.replace(/^v1/, "v7"), "account:acc1:email")).rejects.toThrow("unknown key version");
    await expect(c.decrypt("garbage", "account:acc1:email")).rejects.toThrow("unknown key version");
  });

  it("decrypts an old version after rotation and encrypts with the newest", async () => {
    const old = await cryptoFor();
    const sealed = await old.encrypt("nath@example.org", "ctx");
    const rotated = await cryptoFor({ ASV_DATA_KEYS: `1:${key32(1)}, 2:${key32(2)}` });

    expect(await rotated.decrypt(sealed, "ctx")).toBe("nath@example.org");
    expect(await rotated.encrypt("x", "ctx")).toMatch(/^v2\./);
  });
});

describe("keyed hash", () => {
  it("is stable for one key and differs across keys", async () => {
    const a = await cryptoFor();
    const b = await cryptoFor({ ASV_HMAC_KEY: key32(8) });

    expect(await a.keyedHash("nath@example.org")).toBe(await a.keyedHash("nath@example.org"));
    expect(await a.keyedHash("nath@example.org")).not.toBe(await b.keyedHash("nath@example.org"));
    expect(await a.keyedHash("nath@example.org")).toMatch(/^[\w-]{43}$/);
  });
});

describe("vault sealer", () => {
  it("seals to the owner key: only the private key opens it", async () => {
    const owner = await ownerKeyPair();
    const c = await cryptoFor({ ASV_VAULT_PUBLIC_KEY: owner.publicBase64 });

    const sealed = await c.seal("nath@example.org");

    expect(sealed).toMatch(/^e1\./);
    expect(sealed).not.toContain("nath");
    expect(await openSealed(owner.privateKey, sealed)).toBe("nath@example.org");
    const stranger = await ownerKeyPair();
    await expect(openSealed(stranger.privateKey, sealed)).rejects.toThrow();
  });
});

describe("cryptoKeysFromEnv", () => {
  it("refuses missing secrets in production", async () => {
    await expect(cryptoKeysFromEnv({}, true, () => undefined)).rejects.toThrow(
      "missing secrets: ASV_DATA_KEYS, ASV_HMAC_KEY, ASV_VAULT_PUBLIC_KEY",
    );
  });

  it("generates throwaway keys in development, with a warning", async () => {
    const warn = vi.fn();

    const c = createCrypto(await cryptoKeysFromEnv({}, false, warn));

    expect(warn).toHaveBeenCalledOnce();
    expect(await c.decrypt(await c.encrypt("x", "ctx"), "ctx")).toBe("x");
    expect(await c.seal("x")).toMatch(/^e1\./);
  });

  it.each([
    ["a short data key", { ASV_DATA_KEYS: `1:${toBase64Url(new Uint8Array(16))}` }, "32 bytes"],
    ["a bad version", { ASV_DATA_KEYS: `zero:${key32(1)}` }, "version:base64key"],
    ["a duplicate version", { ASV_DATA_KEYS: `1:${key32(1)},1:${key32(2)}` }, "distinct"],
    ["a short HMAC key", { ASV_HMAC_KEY: toBase64Url(new Uint8Array(8)) }, "at least 32 bytes"],
  ])("refuses %s", async (_, overrides, message) => {
    await expect(cryptoKeysFromEnv(await env(overrides), true, () => undefined)).rejects.toThrow(message);
  });
});
