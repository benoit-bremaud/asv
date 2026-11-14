import { describe, expect, it } from "vitest";
import { accessIssuer, createAccessVerifier, JWKS_MIN_REFETCH_MS, JWKS_TTL_MS } from "./access";
import { AUD_OWNER, AUD_SITE, claims, createSigner, jwksServer, TEAM } from "./test-env";

const NOW = Date.UTC(2026, 10, 14, 10);
const first = await createSigner("k1");
const second = await createSigner("k2");

const setup = (keys: () => unknown[] = () => [first.jwk]) => {
  let now = NOW;
  const server = jwksServer(keys);
  const verifier = createAccessVerifier({ teamDomain: TEAM, fetch: server.fetch, now: () => now });
  return { verifier, server, advance: (ms: number) => (now += ms) };
};

describe("Access JWT check (BR-113)", () => {
  it("accepts a token of the team for the expected audience, string or list", async () => {
    const { verifier, server } = setup();

    expect(await verifier.verify(await first.sign(claims(AUD_SITE, NOW)), AUD_SITE)).toBe("ok");
    expect(await verifier.verify(await first.sign(claims([AUD_OWNER, "x"], NOW)), AUD_OWNER)).toBe("ok");
    expect(server.calls).toEqual([`https://${TEAM}/cdn-cgi/access/certs`]);
  });

  it("answers audience for a valid token of another application", async () => {
    const { verifier } = setup();
    expect(await verifier.verify(await first.sign(claims(AUD_SITE, NOW)), AUD_OWNER)).toBe("audience");
  });

  it.each([
    ["missing", undefined],
    ["not three parts", "a.b"],
    ["empty part", "a..c"],
    ["not JSON", "e30.!!!.c2ln"],
  ])("refuses a %s token", async (_label, token) => {
    const { verifier } = setup();
    expect(await verifier.verify(token, AUD_SITE)).toBe("invalid");
  });

  it("refuses another algorithm, a missing kid or an unknown key", async () => {
    const { verifier } = setup();
    expect(await verifier.verify(await first.sign(claims(AUD_SITE, NOW), { alg: "HS256", kid: "k1" }), AUD_SITE)).toBe("invalid");
    expect(await verifier.verify(await first.sign(claims(AUD_SITE, NOW), { alg: "RS256" }), AUD_SITE)).toBe("invalid");
    expect(await verifier.verify(await second.sign(claims(AUD_SITE, NOW)), AUD_SITE)).toBe("invalid");
  });

  it("refuses a forged signature, a non-RSA key, a wrong issuer, expiry and not-before", async () => {
    const { verifier } = setup(() => [first.jwk, { kid: "ec", kty: "EC" }]);
    const forged = (await second.sign(claims(AUD_SITE, NOW), { alg: "RS256", kid: "k1" }));

    expect(await verifier.verify(forged, AUD_SITE)).toBe("invalid");
    expect(await verifier.verify(await first.sign(claims(AUD_SITE, NOW), { alg: "RS256", kid: "ec" }), AUD_SITE)).toBe("invalid");
    expect(await verifier.verify(await first.sign({ ...claims(AUD_SITE, NOW), iss: "https://evil.cloudflareaccess.com" }), AUD_SITE)).toBe("invalid");
    expect(await verifier.verify(await first.sign({ ...claims(AUD_SITE, NOW), exp: NOW / 1000 }), AUD_SITE)).toBe("invalid");
    expect(await verifier.verify(await first.sign({ ...claims(AUD_SITE, NOW), exp: undefined }), AUD_SITE)).toBe("invalid");
    expect(await verifier.verify(await first.sign({ ...claims(AUD_SITE, NOW), nbf: NOW / 1000 + 10 }), AUD_SITE)).toBe("invalid");
  });

  it("fails closed when the JWKS endpoint fails or answers garbage", async () => {
    const down = createAccessVerifier({ teamDomain: TEAM, fetch: () => Promise.resolve(new Response(null, { status: 500 })), now: () => NOW });
    const garbage = createAccessVerifier({ teamDomain: TEAM, fetch: () => Promise.resolve(Response.json({ nope: 1 })), now: () => NOW });
    const token = await first.sign(claims(AUD_SITE, NOW));

    expect(await down.verify(token, AUD_SITE)).toBe("invalid");
    expect(await garbage.verify(token, AUD_SITE)).toBe("invalid");
  });

  it("caches the JWKS, refetches once a minute at most for an unknown kid, and after the TTL", async () => {
    let keys: unknown[] = [first.jwk];
    const { verifier, server, advance } = setup(() => keys);
    await verifier.verify(await first.sign(claims(AUD_SITE, NOW)), AUD_SITE);
    keys = [first.jwk, second.jwk];

    expect(await verifier.verify(await second.sign(claims(AUD_SITE, NOW)), AUD_SITE)).toBe("invalid");
    expect(server.calls).toHaveLength(1);
    advance(JWKS_MIN_REFETCH_MS);
    expect(await verifier.verify(await second.sign(claims(AUD_SITE, NOW)), AUD_SITE)).toBe("ok");
    expect(server.calls).toHaveLength(2);
    advance(JWKS_TTL_MS);
    await verifier.verify(await first.sign(claims(AUD_SITE, NOW + JWKS_TTL_MS)), AUD_SITE);
    expect(server.calls).toHaveLength(3);
  });

  it("derives the issuer from the team domain", () => {
    expect(accessIssuer(TEAM)).toBe(`https://${TEAM}`);
  });
});
