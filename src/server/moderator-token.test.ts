import { describe, expect, it } from "vitest";
import { matchesModeratorToken, MIN_MODERATOR_TOKEN_LENGTH, moderatorTokenDigest } from "./moderator-token";

const TOKEN = "t".repeat(MIN_MODERATOR_TOKEN_LENGTH);

describe("moderatorTokenDigest (BR-091)", () => {
  it.each([undefined, ""])("disables moderator access when the token is %j", async (token) => {
    expect(await moderatorTokenDigest(token, true)).toBeUndefined();
  });

  it("refuses a token in tunnel mode", async () => {
    await expect(moderatorTokenDigest(TOKEN, true)).rejects.toThrow("ASV_TUNNEL=1");
  });

  it("refuses a token shorter than 32 characters", async () => {
    await expect(moderatorTokenDigest(TOKEN.slice(1), false)).rejects.toThrow("at least 32");
  });

  it("keeps a 32-byte digest of a long enough token", async () => {
    expect(await moderatorTokenDigest(TOKEN, false)).toHaveLength(32);
  });
});

describe("matchesModeratorToken", () => {
  it("accepts only the exact token", async () => {
    const digest = await moderatorTokenDigest(TOKEN, false);

    expect(await matchesModeratorToken(digest, TOKEN)).toBe(true);
    expect(await matchesModeratorToken(digest, `${TOKEN}x`)).toBe(false);
    expect(await matchesModeratorToken(digest, "")).toBe(false);
  });

  it("refuses every grant when no token is set", async () => {
    expect(await matchesModeratorToken(undefined, TOKEN)).toBe(false);
  });
});
