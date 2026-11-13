import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrolModerator, moderationAccess, signInModerator, takeEnrolToken } from "./moderator-passkey";

// WebAuthn on the device and the `/mod` routes are the boundary.
const webauthn = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  startAuthentication: vi.fn(async () => ({ id: "cred" })),
  startRegistration: vi.fn(async () => ({ id: "cred" })),
}));
vi.mock("@simplewebauthn/browser", () => webauthn);

const reply = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });
const notAllowed = Object.assign(new Error("user cancelled"), { name: "NotAllowedError" });
let fetchStub: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  fetchStub = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchStub);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  webauthn.browserSupportsWebAuthn.mockReturnValue(true);
});

describe("moderationAccess (BR-097, web-ui/09)", () => {
  it.each([
    [reply(200, { enabled: true }), true, "on"],
    [reply(200, { enabled: true }), false, "noPasskey"],
    [reply(404), true, "off"],
    [reply(200, { enabled: "yes" }), true, "off"],
    [new Response("<!doctype html>", { status: 200, headers: { "Content-Type": "text/html" } }), true, "off"],
  ])("answer %# gives %s", async (response, supported, expected) => {
    fetchStub.mockResolvedValueOnce(response);
    webauthn.browserSupportsWebAuthn.mockReturnValue(supported);

    expect(await moderationAccess()).toBe(expected);
  });

  it("is off when the network fails", async () => {
    fetchStub.mockRejectedValueOnce(new TypeError("offline"));

    expect(await moderationAccess()).toBe("off");
  });
});

describe("signInModerator (UC16)", () => {
  it("returns the grant after the signed challenge", async () => {
    fetchStub.mockResolvedValueOnce(reply(200, { challenge: "c" })).mockResolvedValueOnce(reply(200, { grant: "g.mac", name: "Marc" }));

    expect(await signInModerator()).toEqual({ grant: "g.mac", name: "Marc" });
    expect(webauthn.startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: "c" } });
    expect(JSON.parse(String(fetchStub.mock.calls[1]?.[1]?.body))).toEqual({ response: { id: "cred" } });
  });

  it.each([
    ["options refused", [reply(429)]],
    ["proof refused", [reply(200, {}), reply(401)]],
    ["malformed answer", [reply(200, {}), reply(200, { grant: 1, name: "Marc" })]],
  ])("is refused on %s", async (_case, replies) => {
    for (const r of replies) fetchStub.mockResolvedValueOnce(r);

    expect(await signInModerator()).toBe("refused");
  });

  it("tells a cancelled ceremony from a failure", async () => {
    fetchStub.mockResolvedValue(reply(200, {}));
    webauthn.startAuthentication.mockRejectedValueOnce(notAllowed).mockRejectedValueOnce(new Error("boom"));

    expect(await signInModerator()).toBe("cancelled");
    expect(await signInModerator()).toBe("refused");
  });
});

describe("enrolModerator (UC15)", () => {
  it("registers the passkey for the invitation", async () => {
    fetchStub.mockResolvedValueOnce(reply(200, { challenge: "c" })).mockResolvedValueOnce(reply(201, { name: "Marc" }));

    expect(await enrolModerator("tok")).toEqual({ name: "Marc" });
    expect(JSON.parse(String(fetchStub.mock.calls[1]?.[1]?.body))).toEqual({ token: "tok", response: { id: "cred" } });
  });

  it.each([
    ["gone options", [reply(410)], "gone"],
    ["failed options", [reply(500)], "failed"],
    ["gone on registration", [reply(200, {}), reply(410)], "gone"],
    ["refused registration", [reply(200, {}), reply(401)], "failed"],
    ["malformed answer", [reply(200, {}), reply(201, {})], "failed"],
  ])("maps %s", async (_case, replies, expected) => {
    for (const r of replies) fetchStub.mockResolvedValueOnce(r);

    expect(await enrolModerator("tok")).toBe(expected);
  });

  it("tells a cancelled ceremony from a failure", async () => {
    fetchStub.mockResolvedValue(reply(200, {}));
    webauthn.startRegistration.mockRejectedValueOnce(notAllowed).mockRejectedValueOnce(new Error("boom"));

    expect(await enrolModerator("tok")).toBe("cancelled");
    expect(await enrolModerator("tok")).toBe("failed");
  });
});

describe("takeEnrolToken (BR-097)", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("takes the token and clears it from the address bar", () => {
    window.history.replaceState(null, "", "/?x=1#mod/enroll/Ab_-9");

    expect(takeEnrolToken()).toBe("Ab_-9");
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?x=1");
  });

  it.each([["#mod/enroll/bad token"], ["#mod/enroll/"], [`#mod/enroll/${"a".repeat(65)}`]])("gives an empty token for %s", (hash) => {
    window.history.replaceState(null, "", `/${hash}`);

    expect(takeEnrolToken()).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("ignores any other address", () => {
    window.history.replaceState(null, "", "/#rooms");

    expect(takeEnrolToken()).toBeUndefined();
    expect(window.location.hash).toBe("#rooms");
  });
});
