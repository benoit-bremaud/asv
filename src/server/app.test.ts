import { describe, expect, it, vi } from "vitest";
import { createApp, type AccountRouteDeps } from "./app";

describe("createApp", () => {
  const app = createApp({
    stats: () => ({ connected: 3 }),
    accounts: { allowedOrigins: [], secureCookie: true, redeemDeviceClaim: () => Promise.resolve(undefined), signOutDevice: () => Promise.resolve() },
  });

  it("serves the connected count, uncached", async () => {
    const response = await app.request("/api/stats");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ connected: 3 });
  });

  it("has no other route", async () => {
    expect((await app.request("/")).status).toBe(404);
  });
});

describe("account routes (platform/04d)", () => {
  const ORIGIN = "http://localhost:5173";
  const setup = (overrides: Partial<AccountRouteDeps> = {}) => {
    const redeemDeviceClaim = vi.fn<AccountRouteDeps["redeemDeviceClaim"]>(() =>
      Promise.resolve({ token: "devtok", expiresAt: new Date("2026-11-22T10:00:00Z") }),
    );
    const signOutDevice = vi.fn<AccountRouteDeps["signOutDevice"]>(() => Promise.resolve());
    const app = createApp({
      stats: () => ({ connected: 0 }),
      accounts: { allowedOrigins: [ORIGIN], secureCookie: true, redeemDeviceClaim, signOutDevice, ...overrides },
    });
    const post = (path: string, init: { origin?: string; body?: string; cookie?: string } = {}) =>
      app.request(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(init.origin === undefined ? { origin: ORIGIN } : init.origin ? { origin: init.origin } : {}),
          ...(init.cookie ? { cookie: init.cookie } : {}),
        },
        body: init.body,
      });
    return { post, redeemDeviceClaim, signOutDevice };
  };

  it("exchanges a claim for the HttpOnly, Secure, SameSite=Lax device cookie valid 30 days", async () => {
    const { post, redeemDeviceClaim } = setup();

    const response = await post("/account/device", { body: JSON.stringify({ claim: "c1" }) });

    expect(response.status).toBe(204);
    expect(redeemDeviceClaim).toHaveBeenCalledWith("c1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("asv_device=devtok");
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toContain("Path=/");
  });

  it("omits Secure only when told to (plain HTTP in development)", async () => {
    const { post } = setup({ secureCookie: false });
    const response = await post("/account/device", { body: JSON.stringify({ claim: "c1" }) });
    expect(response.headers.get("set-cookie")).not.toMatch(/Secure/);
  });

  it.each([
    ["an unknown claim", JSON.stringify({ claim: "c1" }), true],
    ["no claim", JSON.stringify({}), false],
    ["a non-string claim", JSON.stringify({ claim: 3 }), false],
    ["an oversized claim", JSON.stringify({ claim: "x".repeat(65) }), false],
    ["a body that is not JSON", "nope", false],
    ["a JSON null", "null", false],
  ])("answers 400 for %s", async (_, body, reachesHub) => {
    const redeemDeviceClaim = vi.fn<AccountRouteDeps["redeemDeviceClaim"]>(() => Promise.resolve(undefined));
    const { post } = setup({ redeemDeviceClaim });

    const response = await post("/account/device", { body });

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(redeemDeviceClaim).toHaveBeenCalledTimes(reachesHub ? 1 : 0);
  });

  it.each([["a foreign origin", "https://evil.example"], ["no origin", ""]])("refuses %s with 403", async (_, origin) => {
    const { post, redeemDeviceClaim, signOutDevice } = setup();

    expect((await post("/account/device", { origin, body: JSON.stringify({ claim: "c1" }) })).status).toBe(403);
    expect((await post("/account/sign-out", { origin, cookie: "asv_device=devtok" })).status).toBe(403);
    expect(redeemDeviceClaim).not.toHaveBeenCalled();
    expect(signOutDevice).not.toHaveBeenCalled();
  });

  it("signs this device out and clears the cookie", async () => {
    const { post, signOutDevice } = setup();

    const response = await post("/account/sign-out", { cookie: "asv_device=devtok" });

    expect(response.status).toBe(204);
    expect(signOutDevice).toHaveBeenCalledWith("devtok");
    expect(response.headers.get("set-cookie")).toMatch(/asv_device=;.*Max-Age=0/);
  });

  it("clears the cookie even without one", async () => {
    const { post, signOutDevice } = setup();

    const response = await post("/account/sign-out");

    expect(response.status).toBe(204);
    expect(signOutDevice).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toMatch(/asv_device=;/);
  });
});
