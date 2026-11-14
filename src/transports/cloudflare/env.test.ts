import { describe, expect, it } from "vitest";
import { cachedConfig, checkConfig, PLACEHOLDER } from "./env";
import { validEnv } from "./test-env";

const problemOf = async (overrides: Parameters<typeof validEnv>[0]) => {
  const config = await checkConfig(validEnv(overrides));
  return "problem" in config ? config.problem : undefined;
};

describe("start checks (BR-111)", () => {
  it("accepts a complete configuration and reads moderation on or off", async () => {
    const on = await checkConfig(validEnv());
    const off = await checkConfig(validEnv({ ASV_MODERATION: "off" }));

    expect(on).toMatchObject({ moderation: true, publicOrigin: "https://staging.asvchat.fr", allowedOrigins: ["https://staging.asvchat.fr", "https://asvchat.fr"], accessAudOwner: "aud-owner" });
    expect(off).toMatchObject({ moderation: false });
  });

  it("names missing and placeholder values, never a value", async () => {
    const problem = await problemOf({ BREVO_API_KEY: undefined, ASV_ACCESS_AUD_SITE: PLACEHOLDER });
    expect(problem).toBe("missing: BREVO_API_KEY, ASV_ACCESS_AUD_SITE");
  });

  it.each([
    [{ ASV_MODERATION: undefined }, /ASV_MODERATION must be on or off/],
    [{ ASV_MODERATION: "On" }, /ASV_MODERATION must be on or off/],
    [{ ASV_OWNER_SECRET: "short" }, /ASV_OWNER_SECRET shorter/],
    [{ ASV_ACCESS_TEAM_DOMAIN: "evil.example.com" }, /ASV_ACCESS_TEAM_DOMAIN/],
    [{ ASV_PUBLIC_ORIGIN: "http://staging.asvchat.fr", ASV_ALLOWED_ORIGINS: "http://staging.asvchat.fr" }, /https origin/],
    [{ ASV_PUBLIC_ORIGIN: "https://other.fr" }, /listed/],
    [{ ASV_PUBLIC_ORIGIN: "https://staging.asvchat.fr/path" }, /https origin/],
    [{ ASV_HMAC_KEY: "c2hvcnQ" }, /ASV_HMAC_KEY/],
    [{ ASV_DATA_KEYS: "zero:abc" }, /ASV_DATA_KEYS/],
  ])("refuses %o", async (overrides, expected) => {
    expect(await problemOf(overrides)).toMatch(expected);
  });

  it("checks one environment once", async () => {
    const env = validEnv();
    expect(cachedConfig(env)).toBe(cachedConfig(env));
    expect(cachedConfig(validEnv())).not.toBe(cachedConfig(env));
  });
});
