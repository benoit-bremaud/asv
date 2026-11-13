/** Moderator grant (BR-095, `moderation/02f`): HMAC-signed, 60 s, tamper-proof. Only the key is real crypto. */
import { describe, expect, it } from "vitest";
import { fromBase64, toBase64Url } from "./crypto/keys";
import { createGrantKey, readGrant, signGrant } from "./moderator-grant";

const T0 = new Date("2026-11-13T10:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);
const encoder = new TextEncoder();

describe("moderator grant", () => {
  it("round-trips the name, a nonce and the expiry", async () => {
    const key = await createGrantKey();

    const claims = await readGrant(key, await signGrant(key, "Marc", T0), T0);

    expect(claims).toMatchObject({ name: "Marc", expiresAt: T0.getTime() + 60_000 });
    expect(claims?.nonce).toMatch(/^[\w-]{22}$/);
  });

  it.each([
    ["just before 60 s", 59_999, true],
    ["exactly at 60 s", 60_000, false],
    ["after 60 s", 61_000, false],
  ])("is %s: valid is %s", async (_label, elapsed, valid) => {
    const key = await createGrantKey();
    const grant = await signGrant(key, "Marc", T0);

    expect(Boolean(await readGrant(key, grant, later(elapsed)))).toBe(valid);
  });

  it("draws a different nonce each time", async () => {
    const key = await createGrantKey();

    const nonces = await Promise.all(
      Array.from({ length: 20 }, async () => (await readGrant(key, await signGrant(key, "Marc", T0), T0))?.nonce),
    );

    expect(new Set(nonces).size).toBe(20);
  });

  it("refuses a tampered body", async () => {
    const key = await createGrantKey();
    const [body = "", mac = ""] = (await signGrant(key, "Marc", T0)).split(".");
    const claims = JSON.parse(new TextDecoder().decode(fromBase64(body))) as object;
    const forged = toBase64Url(encoder.encode(JSON.stringify({ ...claims, name: "Admin" })));

    expect(await readGrant(key, `${forged}.${mac}`, T0)).toBeUndefined();
  });

  it("refuses a tampered mac", async () => {
    const key = await createGrantKey();
    const [body = "", mac = ""] = (await signGrant(key, "Marc", T0)).split(".");
    const flipped = `${mac.startsWith("A") ? "B" : "A"}${mac.slice(1)}`;

    expect(await readGrant(key, `${body}.${flipped}`, T0)).toBeUndefined();
  });

  it("refuses a grant signed by another key (a restart voids pending grants)", async () => {
    const grant = await signGrant(await createGrantKey(), "Marc", T0);

    expect(await readGrant(await createGrantKey(), grant, T0)).toBeUndefined();
  });

  it("refuses a well-signed body that is not claims", async () => {
    const key = await createGrantKey();
    const body = toBase64Url(encoder.encode(JSON.stringify({ name: 1, nonce: "n", expiresAt: T0.getTime() + 1000 })));
    const mac = toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body))));

    expect(await readGrant(key, `${body}.${mac}`, T0)).toBeUndefined();
  });

  it.each([
    ["empty", ""],
    ["no dot", "abc"],
    ["three parts", "a.b.c"],
    ["empty parts", "."],
    ["not base64", "!!!.???"],
  ])("refuses a malformed string: %s", async (_label, text) => {
    expect(await readGrant(await createGrantKey(), text, T0)).toBeUndefined();
  });
});
