import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCloudflareRandom } from "./random";

const key = new Uint8Array(32).fill(7);

describe("Cloudflare random (BR-073, BR-109)", () => {
  it("hashes tokens with a key derived from ASV_HMAC_KEY, stable across instances", () => {
    const one = createCloudflareRandom(key);
    const token = one.token();

    expect(createCloudflareRandom(key).hashToken(token.value)).toBe(token.hash);
    expect(createCloudflareRandom(new Uint8Array(32).fill(8)).hashToken(token.value)).not.toBe(token.hash);
    expect(token.value).toMatch(/^[\w-]{43}$/);
  });

  it("derives the key under a NUL-prefixed label no keyed hash input can take", () => {
    const hashUnder = (label: string) => (value: string) =>
      createHmac("sha256", createHmac("sha256", key).update(label).digest()).update(value).digest("base64url");

    expect(createCloudflareRandom(key).hashToken("t")).toBe(hashUnder("\u0000asv-device-token-v1")("t"));
    expect(createCloudflareRandom(key).hashToken("t")).not.toBe(hashUnder("asv-device-token-v1")("t"));
  });

  it("draws distinct ids and six-digit codes", () => {
    const random = createCloudflareRandom(key);
    expect(random.id()).not.toBe(random.id());
    for (let index = 0; index < 50; index += 1) expect(random.code()).toMatch(/^\d{6}$/);
  });
});
