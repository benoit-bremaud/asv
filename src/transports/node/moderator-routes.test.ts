/**
 * `/mod/*` and `/owner/*` routes of brick 8b through `app.request`. Real hub operations, crypto and memory store; only the
 * SimpleWebAuthn verify functions (browser-signed proofs we cannot forge here), the clock and the peer are doubles.
 */
import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryModeratorStore } from "./moderator-stores";
import { createCrypto } from "../../server/crypto/cipher";
import { cryptoKeysFromEnv, toBase64Url } from "../../server/crypto/keys";
import { createModeratorOps } from "../../server/hub-moderators";
import { createGrantKey, readGrant } from "../../server/moderator-grant";
import { createModeratorIo } from "../../server/moderator-io";
import { addModeratorRoutes, checkOwnerSecret, OWNER_FAILURES_MAX, OWNER_WINDOW_MS, type ModeratorRouteDeps } from "../../server/moderator-routes";

vi.mock("@simplewebauthn/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@simplewebauthn/server")>()),
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

const verifyRegistration = vi.mocked(verifyRegistrationResponse);
const verifyAuthentication = vi.mocked(verifyAuthenticationResponse);

const SECRET = "s".repeat(32);
const ORIGIN = "https://chat.example.org";
const T0 = new Date("2026-11-13T10:00:00Z");

interface Options {
  ownerSecret?: string | null;
  behindTunnel?: boolean;
}

const setup = async (options: Options = {}) => {
  const clock = { now: T0 };
  const peer = { address: "127.0.0.1" as string | undefined };
  const store = createMemoryModeratorStore();
  const crypto = createCrypto(await cryptoKeysFromEnv({}, false, () => undefined));
  const io = createModeratorIo({ store, crypto });
  const ops = createModeratorOps(io);
  const grantKey = await createGrantKey();
  const onError = vi.fn();
  const recordFiling = vi.fn<ModeratorRouteDeps["recordFiling"]>().mockResolvedValue("filed");
  const app = new Hono();
  addModeratorRoutes(app, {
    ops,
    grantKey,
    publicOrigin: ORIGIN,
    allowedOrigins: [ORIGIN],
    ownerSecret: options.ownerSecret === null ? undefined : (options.ownerSecret ?? SECRET),
    behindTunnel: options.behindTunnel ?? false,
    recordFiling,
    peerAddress: () => peer.address,
    now: () => clock.now,
    onError,
  });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
  const owner = (path: string, init: { method: string; body?: unknown; secret?: string }) =>
    app.request(path, {
      method: init.method,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      headers: { "content-type": "application/json", authorization: `Bearer ${init.secret ?? SECRET}` },
    });
  const browser = (path: string, body: unknown) => post(path, body, { origin: ORIGIN });
  return { app, io, ops, store, grantKey, onError, recordFiling, clock, peer, post, owner, browser };
};

type Context = Awaited<ReturnType<typeof setup>>;

const invite = async (context: Context, name = "Marc") => {
  const response = await context.owner("/owner/invitations", { method: "POST", body: { name } });
  const { link } = (await response.json()) as { link: string };
  return link.split("/").pop() ?? "";
};

const clientData = (challenge: string) => toBase64Url(new TextEncoder().encode(JSON.stringify({ challenge })));
const credentialResponse = (id: string, challenge: string) => ({ id, response: { clientDataJSON: clientData(challenge) } });

beforeEach(() => {
  verifyRegistration.mockReset();
  verifyAuthentication.mockReset();
});

describe("checkOwnerSecret (BR-093)", () => {
  it.each([
    ["unset", undefined, undefined],
    ["empty", "", undefined],
    ["long enough", SECRET, SECRET],
  ])("%s", (_label, secret, expected) => {
    expect(checkOwnerSecret(secret)).toBe(expected);
  });

  it("stops the start on a short secret", () => {
    expect(() => checkOwnerSecret("short")).toThrow(/32 characters/);
  });
});

describe("GET /mod/status", () => {
  it("answers enabled, uncached, with no origin or secret needed", async () => {
    const { app } = await setup();

    const response = await app.request("/mod/status");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("the former owner paths (ADR-0020 D8)", () => {
  it.each([
    ["POST", "/mod/invitations"],
    ["DELETE", "/mod/moderators/Marc"],
    ["POST", "/mod/authority-filings"],
  ])("answers 404 to %s %s even with the right secret", async (method, path) => {
    const { app } = await setup();

    const response = await app.request(path, { method, body: "{}", headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" } });

    expect(response.status).toBe(404);
  });
});

describe("behind the tester tunnel (BR-097)", () => {
  it.each([
    ["GET", "/mod/status"],
    ["POST", "/owner/invitations"],
    ["DELETE", "/owner/moderators/Marc"],
    ["POST", "/owner/authority-filings"],
    ["POST", "/mod/enroll"],
    ["POST", "/mod/sign-in/options"],
  ])("answers 404 to %s %s", async (method, path) => {
    const { app } = await setup({ behindTunnel: true });

    const response = await app.request(path, { method, headers: { authorization: `Bearer ${SECRET}`, origin: ORIGIN } });

    expect(response.status).toBe(404);
  });
});

describe("owner routes (BR-093, BR-096)", () => {
  it("creates an invitation and returns a link with a 256-bit token", async () => {
    const context = await setup();

    const response = await context.owner("/owner/invitations", { method: "POST", body: { name: "Marc" } });

    expect(response.status).toBe(201);
    const { link } = (await response.json()) as { link: string };
    expect(link).toMatch(new RegExp(`^${ORIGIN}/#mod/enroll/[\\w-]{43}$`));
    expect(await context.io.invitedName(link.split("/").pop() ?? "", T0)).toBe("Marc");
  });

  it.each([
    ["no secret", undefined],
    ["a wrong secret", "x".repeat(32)],
    ["a short secret", "short"],
    ["an empty secret", ""],
  ])("refuses %s with 401", async (_label, secret) => {
    const { app } = await setup();
    const headers: Record<string, string> = secret === undefined ? {} : { authorization: `Bearer ${secret}` };

    const response = await app.request("/owner/invitations", { method: "POST", body: JSON.stringify({ name: "Marc" }), headers });

    expect(response.status).toBe(401);
  });

  it("refuses a non-Bearer authorization scheme", async () => {
    const { app } = await setup();

    const response = await app.request("/owner/invitations", { method: "POST", body: "{}", headers: { authorization: `Basic ${SECRET}` } });

    expect(response.status).toBe(401);
  });

  it.each([
    ["a non-loopback peer", "203.0.113.5"],
    ["an unknown peer", undefined],
  ])("answers 404 to %s even with the right secret", async (_label, address) => {
    const context = await setup();
    context.peer.address = address;

    expect((await context.owner("/owner/invitations", { method: "POST", body: { name: "Marc" } })).status).toBe(404);
    expect((await context.owner("/owner/moderators/Marc", { method: "DELETE" })).status).toBe(404);
  });

  it.each(["::1", "::ffff:127.0.0.1"])("accepts the loopback peer %s", async (address) => {
    const context = await setup();
    context.peer.address = address;

    expect((await context.owner("/owner/invitations", { method: "POST", body: { name: "Marc" } })).status).toBe(201);
  });

  it("answers 404 when no owner secret is set", async () => {
    const context = await setup({ ownerSecret: null });

    expect((await context.owner("/owner/invitations", { method: "POST", body: { name: "Marc" } })).status).toBe(404);
  });

  it("refuses the sixth failure within 10 minutes with 429, even the right secret, then lets it through", async () => {
    const context = await setup();
    for (let index = 0; index < OWNER_FAILURES_MAX; index += 1) {
      expect((await context.owner("/owner/invitations", { method: "POST", body: {}, secret: "wrong" })).status).toBe(401);
    }

    const blocked = await context.owner("/owner/invitations", { method: "POST", body: { name: "Marc" } });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("600");

    context.clock.now = new Date(T0.getTime() + OWNER_WINDOW_MS);
    expect((await context.owner("/owner/invitations", { method: "POST", body: { name: "Marc" } })).status).toBe(201);
  });

  it("counts an IPv4-mapped loopback peer in the same window as 127.0.0.1", async () => {
    const context = await setup();
    context.peer.address = "::ffff:127.0.0.1";
    for (let index = 0; index < OWNER_FAILURES_MAX; index += 1) await context.owner("/owner/invitations", { method: "POST", body: {}, secret: "wrong" });
    context.peer.address = "127.0.0.1";

    expect((await context.owner("/owner/invitations", { method: "POST", body: { name: "Marc" } })).status).toBe(429);
  });

  it("does not count successes toward the rate limit", async () => {
    const context = await setup();
    for (let index = 0; index < OWNER_FAILURES_MAX + 2; index += 1) {
      expect((await context.owner("/owner/invitations", { method: "POST", body: { name: "Marc" } })).status).toBe(201);
    }
  });

  it.each([
    ["a missing name", {}],
    ["a number", { name: 5 }],
    ["a too short name", { name: "a" }],
    ["a name with a space", { name: "Marc Dupont" }],
    ["a name over 20 characters", { name: "a".repeat(21) }],
  ])("answers 400 to an invitation with %s", async (_label, body) => {
    const context = await setup();

    expect((await context.owner("/owner/invitations", { method: "POST", body })).status).toBe(400);
  });

  it("answers 400 to an invitation whose body is not JSON", async () => {
    const { app } = await setup();

    const response = await app.request("/owner/invitations", { method: "POST", body: "nope", headers: { authorization: `Bearer ${SECRET}` } });

    expect(response.status).toBe(400);
  });

  it("revokes an enrolled moderator with 204, then 404, and 400 on a bad name", async () => {
    const context = await setup();
    await context.io.saveInvitation("tok", "Marc", new Date(T0.getTime() + 1000));
    await context.io.enroll("tok", "cred", "pk", 0, T0);

    expect((await context.owner("/owner/moderators/Marc", { method: "DELETE" })).status).toBe(204);
    expect((await context.owner("/owner/moderators/Marc", { method: "DELETE" })).status).toBe(404);
    expect((await context.owner("/owner/moderators/a", { method: "DELETE" })).status).toBe(400);
  });

  it("answers 503 and reports the error when the store fails", async () => {
    const context = await setup();
    context.store.saveInvitation = () => Promise.reject(new Error("disk"));

    const response = await context.owner("/owner/invitations", { method: "POST", body: { name: "Marc" } });

    expect(response.status).toBe(503);
    expect(context.onError).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe("browser routes guard (BR-096, BR-098)", () => {
  it.each([
    ["no Origin", undefined],
    ["a foreign Origin", "https://evil.example"],
  ])("answers 403 with %s", async (_label, origin) => {
    const { post } = await setup();

    const response = await post("/mod/sign-in/options", {}, origin === undefined ? {} : { origin });

    expect(response.status).toBe(403);
  });

  it("limits ceremonies to a burst of 10 per IP, then 429, and refills over time", async () => {
    const context = await setup();
    for (let index = 0; index < 10; index += 1) expect((await context.browser("/mod/sign-in/options", {})).status).toBe(200);

    const blocked = await context.browser("/mod/sign-in/options", {});
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("10");

    context.peer.address = "198.51.100.7";
    expect((await context.browser("/mod/sign-in/options", {})).status).toBe(200);
    context.clock.now = new Date(T0.getTime() + 6000);
    context.peer.address = "127.0.0.1";
    expect((await context.browser("/mod/sign-in/options", {})).status).toBe(200);
  });

  it("shares the ceremony bucket across one IPv6 /64 (BR-112)", async () => {
    const context = await setup();
    context.peer.address = "2001:db8:0:1::1";
    for (let index = 0; index < 10; index += 1) expect((await context.browser("/mod/sign-in/options", {})).status).toBe(200);

    context.peer.address = "2001:db8:0:1:ffff::2";
    expect((await context.browser("/mod/sign-in/options", {})).status).toBe(429);
    context.peer.address = "2001:db8:0:2::1";
    expect((await context.browser("/mod/sign-in/options", {})).status).toBe(200);
  });

  it("buckets an unknown peer together", async () => {
    const context = await setup();
    context.peer.address = undefined;

    expect((await context.browser("/mod/sign-in/options", {})).status).toBe(200);
  });
});

describe("enrolment (BR-094)", () => {
  it("answers 410 to options when the token is unknown, expired, missing or too long", async () => {
    const context = await setup();
    const token = await invite(context);
    context.clock.now = new Date(T0.getTime() + 24 * 60 * 60_000);

    expect((await context.browser("/mod/enroll/options", { token })).status).toBe(410);
    expect((await context.browser("/mod/enroll/options", { token: "unknown" })).status).toBe(410);
    expect((await context.browser("/mod/enroll/options", {})).status).toBe(410);
    expect((await context.browser("/mod/enroll/options", { token: "t".repeat(65) })).status).toBe(410);
  });

  it("answers registration options for the invited name, with the RP ID from the public origin", async () => {
    const context = await setup();
    const token = await invite(context, "Marc");

    const response = await context.browser("/mod/enroll/options", { token });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      rp: { id: "chat.example.org" },
      user: { name: "Marc" },
      attestation: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });
  });

  it("answers 503 to options when 200 challenges are pending", async () => {
    const context = await setup();
    const token = await invite(context);
    for (let index = 0; index < 200; index += 1) context.ops.keepChallenge(`c${index}`, { kind: "authenticate" }, T0);

    const response = await context.browser("/mod/enroll/options", { token });

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("10");
  });

  const optionsFor = async (context: Context, token: string) => ((await (await context.browser("/mod/enroll/options", { token })).json()) as { challenge: string }).challenge;

  it("enrols on a verified registration, consuming the invitation and the challenge", async () => {
    const context = await setup();
    const token = await invite(context);
    const challenge = await optionsFor(context, token);
    verifyRegistration.mockResolvedValue({
      verified: true,
      registrationInfo: { credential: { id: "cred1", publicKey: new Uint8Array([1, 2, 3]), counter: 4 } },
    } as never);

    const response = await context.browser("/mod/enroll", { token, response: credentialResponse("cred1", challenge) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "Marc" });
    expect(await context.io.byCredential("cred1")).toEqual({ name: "Marc", credentialId: "cred1", publicKey: toBase64Url(new Uint8Array([1, 2, 3])), signCount: 4 });
    expect(verifyRegistration).toHaveBeenCalledWith(expect.objectContaining({ expectedChallenge: challenge, expectedOrigin: ORIGIN, expectedRPID: "chat.example.org", requireUserVerification: true }));
    expect((await context.browser("/mod/enroll", { token, response: credentialResponse("cred1", challenge) })).status).toBe(401);
  });

  it.each([
    ["no token", { response: credentialResponse("c", "x") }],
    ["no response", { token: "tok" }],
    ["a response without id", { token: "tok", response: { response: {} } }],
    ["a response without inner response", { token: "tok", response: { id: "c" } }],
    ["a response with null inner", { token: "tok", response: { id: "c", response: null } }],
    ["a clientDataJSON that is not JSON", { token: "tok", response: { id: "c", response: { clientDataJSON: toBase64Url(new TextEncoder().encode("nope")) } } }],
    ["a clientDataJSON without challenge", { token: "tok", response: { id: "c", response: { clientDataJSON: toBase64Url(new TextEncoder().encode("{}")) } } }],
    ["a clientDataJSON that is not base64", { token: "tok", response: { id: "c", response: { clientDataJSON: "!!!" } } }],
  ])("answers 400 to an enrolment with %s", async (_label, body) => {
    const context = await setup();

    expect((await context.browser("/mod/enroll", body)).status).toBe(400);
    expect(verifyRegistration).not.toHaveBeenCalled();
  });

  it("answers 401 for a challenge never issued", async () => {
    const context = await setup();
    const token = await invite(context);

    expect((await context.browser("/mod/enroll", { token, response: credentialResponse("c", "forged") })).status).toBe(401);
    expect(verifyRegistration).not.toHaveBeenCalled();
  });

  it("answers 401 when the challenge was issued for another invitation token", async () => {
    const context = await setup();
    const token = await invite(context, "Marc");
    const other = await invite(context, "Lola");
    const challenge = await optionsFor(context, token);

    expect((await context.browser("/mod/enroll", { token: other, response: credentialResponse("c", challenge) })).status).toBe(401);
  });

  it("answers 401 when the challenge has expired", async () => {
    const context = await setup();
    const token = await invite(context);
    const challenge = await optionsFor(context, token);
    context.clock.now = new Date(T0.getTime() + 5 * 60_000);

    expect((await context.browser("/mod/enroll", { token, response: credentialResponse("c", challenge) })).status).toBe(401);
  });

  it.each([
    ["not verified", () => verifyRegistration.mockResolvedValue({ verified: false } as never)],
    ["rejecting", () => verifyRegistration.mockRejectedValue(new Error("bad attestation"))],
  ])("answers 401 when the verification is %s, and enrols nobody", async (_label, arrange) => {
    const context = await setup();
    const token = await invite(context);
    const challenge = await optionsFor(context, token);
    arrange();

    expect((await context.browser("/mod/enroll", { token, response: credentialResponse("c", challenge) })).status).toBe(401);
    expect(await context.io.byCredential("c")).toBeUndefined();
    expect(await context.io.invitedName(token, T0)).toBe("Marc");
  });

  it("answers 410 when the invitation vanished between options and enrolment", async () => {
    const context = await setup();
    const token = await invite(context);
    const challenge = await optionsFor(context, token);
    verifyRegistration.mockResolvedValue({ verified: true, registrationInfo: { credential: { id: "c", publicKey: new Uint8Array([1]), counter: 0 } } } as never);
    await context.io.revoke("Marc");

    expect((await context.browser("/mod/enroll", { token, response: credentialResponse("c", challenge) })).status).toBe(410);
  });
});

describe("sign-in (BR-095)", () => {
  const enrolled = async (context: Context) => {
    await context.io.saveInvitation("tok", "Marc", new Date(T0.getTime() + 1000));
    await context.io.enroll("tok", "cred1", toBase64Url(new Uint8Array([9, 9])), 3, T0);
  };
  const challengeOf = async (context: Context) => ((await (await context.browser("/mod/sign-in/options", {})).json()) as { challenge: string }).challenge;

  it("answers authentication options for the RP ID, requiring user verification", async () => {
    const context = await setup();

    const response = await context.browser("/mod/sign-in/options", {});

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ rpId: "chat.example.org", userVerification: "required" });
  });

  it("answers 503 to options when 200 challenges are pending", async () => {
    const context = await setup();
    for (let index = 0; index < 200; index += 1) context.ops.keepChallenge(`c${index}`, { kind: "authenticate" }, T0);

    expect((await context.browser("/mod/sign-in/options", {})).status).toBe(503);
  });

  it("returns a 60 s grant and the name on a verified assertion, and stores the new counter", async () => {
    const context = await setup();
    await enrolled(context);
    const challenge = await challengeOf(context);
    verifyAuthentication.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 8 } } as never);

    const response = await context.browser("/mod/sign-in", { response: credentialResponse("cred1", challenge) });

    expect(response.status).toBe(200);
    const { grant, name } = (await response.json()) as { grant: string; name: string };
    expect(name).toBe("Marc");
    expect(await readGrant(context.grantKey, grant, T0)).toMatchObject({ name: "Marc", expiresAt: T0.getTime() + 60_000 });
    expect((await context.io.byCredential("cred1"))?.signCount).toBe(8);
    expect(verifyAuthentication).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: "chat.example.org",
        requireUserVerification: true,
        credential: expect.objectContaining({ id: "cred1", counter: 3, publicKey: new Uint8Array([9, 9]) }),
      }),
    );
  });

  it("refuses a second sign-in of the same credential while the first is being verified", async () => {
    const context = await setup();
    await enrolled(context);
    const [first, second] = [await challengeOf(context), await challengeOf(context)];
    let release: (value: never) => void = () => undefined;
    verifyAuthentication.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));

    const pending = context.browser("/mod/sign-in", { response: credentialResponse("cred1", first) });
    await vi.waitFor(() => expect(verifyAuthentication).toHaveBeenCalledTimes(1));
    const parallel = await context.browser("/mod/sign-in", { response: credentialResponse("cred1", second) });
    release({ verified: true, authenticationInfo: { newCounter: 8 } } as never);

    expect(parallel.status).toBe(409);
    expect((await pending).status).toBe(200);
    verifyAuthentication.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 9 } } as never);
    expect((await context.browser("/mod/sign-in", { response: credentialResponse("cred1", await challengeOf(context)) })).status).toBe(200);
  });

  it("uses a challenge once", async () => {
    const context = await setup();
    await enrolled(context);
    const challenge = await challengeOf(context);
    verifyAuthentication.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 8 } } as never);
    await context.browser("/mod/sign-in", { response: credentialResponse("cred1", challenge) });

    expect((await context.browser("/mod/sign-in", { response: credentialResponse("cred1", challenge) })).status).toBe(401);
  });

  it.each([
    ["no response", {}],
    ["a response without clientDataJSON", { response: { id: "c", response: {} } }],
  ])("answers 400 to a sign-in with %s", async (_label, body) => {
    const context = await setup();

    expect((await context.browser("/mod/sign-in", body)).status).toBe(400);
  });

  it("answers 401 to a challenge never issued, or an issued register challenge", async () => {
    const context = await setup();
    await enrolled(context);
    context.ops.keepChallenge("reg", { kind: "register", token: "tok" }, T0);

    expect((await context.browser("/mod/sign-in", { response: credentialResponse("cred1", "forged") })).status).toBe(401);
    expect((await context.browser("/mod/sign-in", { response: credentialResponse("cred1", "reg") })).status).toBe(401);
  });

  it("answers 401 to an unknown credential, without verifying", async () => {
    const context = await setup();
    const challenge = await challengeOf(context);

    expect((await context.browser("/mod/sign-in", { response: credentialResponse("ghost", challenge) })).status).toBe(401);
    expect(verifyAuthentication).not.toHaveBeenCalled();
  });

  it("answers 401 to a revoked moderator", async () => {
    const context = await setup();
    await enrolled(context);
    await context.io.revoke("Marc");
    const challenge = await challengeOf(context);

    expect((await context.browser("/mod/sign-in", { response: credentialResponse("cred1", challenge) })).status).toBe(401);
  });

  it.each([
    ["not verified", () => verifyAuthentication.mockResolvedValue({ verified: false } as never)],
    ["rejecting (bad signature or counter)", () => verifyAuthentication.mockRejectedValue(new Error("bad signature"))],
  ])("answers 401 when the verification is %s, leaving the counter alone", async (_label, arrange) => {
    const context = await setup();
    await enrolled(context);
    const challenge = await challengeOf(context);
    arrange();

    expect((await context.browser("/mod/sign-in", { response: credentialResponse("cred1", challenge) })).status).toBe(401);
    expect((await context.io.byCredential("cred1"))?.signCount).toBe(3);
  });

  it("answers 503 and reports the error when the store fails", async () => {
    const context = await setup();
    await enrolled(context);
    const challenge = await challengeOf(context);
    context.store.findByCredential = () => Promise.reject(new Error("disk"));

    const response = await context.browser("/mod/sign-in", { response: credentialResponse("cred1", challenge) });

    expect(response.status).toBe(503);
    expect(context.onError).toHaveBeenCalled();
  });
});

describe("POST /owner/authority-filings (UC20, BR-093, BR-104)", () => {
  const filing = { reportId: "r1", channel: "PHAROS", reference: "PHA-2026-0001" };

  it.each([
    ["PHAROS", "PHAROS"],
    ["17", "police17"],
    ["112", "emergency112"],
    ["PointDeContact", "PointDeContact"],
  ])("records channel %s as %s and answers 204", async (typed, channel) => {
    const context = await setup();

    const response = await context.owner("/owner/authority-filings", { method: "POST", body: { ...filing, channel: typed } });

    expect(response.status).toBe(204);
    expect(context.recordFiling).toHaveBeenCalledWith("r1", channel, "PHA-2026-0001", T0);
  });

  it.each([
    ["alreadyFiled", 409],
    ["noAlert", 404],
  ] as const)("answers %s with %i", async (result, status) => {
    const context = await setup();
    context.recordFiling.mockResolvedValueOnce(result);

    expect((await context.owner("/owner/authority-filings", { method: "POST", body: filing })).status).toBe(status);
  });

  it.each([
    ["an unknown channel", { ...filing, channel: "police" }],
    ["an inherited key as channel", { ...filing, channel: "toString" }],
    ["an empty reference", { ...filing, reference: "   " }],
    ["a reference of 101 characters", { ...filing, reference: "a".repeat(101) }],
    ["a reference with a control character", { ...filing, reference: "ref\u0007" }],
    ["no report id", { channel: "PHAROS", reference: "x" }],
    ["a report id too long", { ...filing, reportId: "r".repeat(65) }],
  ])("answers 400 on %s", async (_label, body) => {
    const context = await setup();

    expect((await context.owner("/owner/authority-filings", { method: "POST", body })).status).toBe(400);
    expect(context.recordFiling).not.toHaveBeenCalled();
  });

  it("stores the reference trimmed", async () => {
    const context = await setup();

    await context.owner("/owner/authority-filings", { method: "POST", body: { ...filing, reference: "  PV 12  " } });

    expect(context.recordFiling).toHaveBeenCalledWith("r1", "PHAROS", "PV 12", T0);
  });

  it("accepts a reference of exactly 100 characters", async () => {
    const context = await setup();

    expect((await context.owner("/owner/authority-filings", { method: "POST", body: { ...filing, reference: "a".repeat(100) } })).status).toBe(204);
  });

  it("refuses a wrong secret with 401 and a remote peer with 404", async () => {
    const context = await setup();

    expect((await context.owner("/owner/authority-filings", { method: "POST", body: filing, secret: "x".repeat(32) })).status).toBe(401);
    context.peer.address = "203.0.113.5";
    expect((await context.owner("/owner/authority-filings", { method: "POST", body: filing })).status).toBe(404);
    expect(context.recordFiling).not.toHaveBeenCalled();
  });

  it("answers 404 behind the tunnel (BR-097)", async () => {
    const context = await setup({ behindTunnel: true });

    expect((await context.owner("/owner/authority-filings", { method: "POST", body: filing })).status).toBe(404);
  });

  it("answers 503 when the store fails", async () => {
    const context = await setup();
    context.recordFiling.mockRejectedValueOnce(new Error("down"));

    expect((await context.owner("/owner/authority-filings", { method: "POST", body: filing })).status).toBe(503);
    expect(context.onError).toHaveBeenCalled();
  });
});
