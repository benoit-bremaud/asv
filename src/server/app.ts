import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { ACCOUNT_LIMITS } from "../domain";
import type { DeviceToken, Stats } from "./hub";

/**
 * Name of the 30-day device cookie (ADR-0013, BR-073). `HttpOnly` keeps it from scripts and `SameSite=Lax`
 * from cross-site posts; keep both when editing the routes.
 */
export const DEVICE_COOKIE = "asv_device";

/** The account routes of `platform/04d`; the transport binds them to its hub. */
export interface AccountRouteDeps {
  /** Exact `Origin` values allowed, as for the WebSocket upgrade. */
  readonly allowedOrigins: readonly string[];
  /** `false` only on plain `http://127.0.0.1` in development. */
  readonly secureCookie: boolean;
  redeemDeviceClaim(claim: string): Promise<DeviceToken | undefined>;
  /** Forgets the device of this raw cookie value and unlinks its sessions. */
  signOutDevice(token: string): Promise<void>;
}

/** What the routes read from the hub. */
export interface AppDeps {
  readonly stats: () => Stats;
  readonly accounts: AccountRouteDeps;
}

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_CLAIM = 64;

const sameOrigin = (c: Context, allowed: readonly string[]): boolean => {
  const origin = c.req.header("origin");
  return origin !== undefined && allowed.includes(origin);
};

const readClaim = async (c: Context): Promise<string | undefined> => {
  try {
    const body: unknown = await c.req.json();
    const claim = typeof body === "object" && body !== null && "claim" in body ? body.claim : undefined;
    return typeof claim === "string" && claim.length > 0 && claim.length <= MAX_CLAIM ? claim : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Builds the Hono app. Each transport calls it and plugs in its hub; the server never
 * imports a transport (ADR-0002). The WebSocket upgrade belongs to the transport (`platform/02`).
 */
export const createApp = (deps: AppDeps): Hono => {
  const app = new Hono();
  const { accounts } = deps;
  // Aggregate only, no pseudo (`platform/04`, D8).
  app.get("/api/stats", (c) => c.json(deps.stats(), 200, NO_STORE));

  // BR-073: a single-use claim from `accountLinked` becomes the HttpOnly device cookie.
  app.post("/account/device", async (c) => {
    if (!sameOrigin(c, accounts.allowedOrigins)) return c.body(null, 403, NO_STORE);
    const claim = await readClaim(c);
    const device = claim === undefined ? undefined : await accounts.redeemDeviceClaim(claim);
    if (!device) return c.body(null, 400, NO_STORE);
    setCookie(c, DEVICE_COOKIE, device.token, {
      httpOnly: true,
      secure: accounts.secureCookie,
      sameSite: "Lax",
      path: "/",
      maxAge: ACCOUNT_LIMITS.deviceTtlMs / 1000,
    });
    return c.body(null, 204, NO_STORE);
  });

  // UC18 "this device": always clears the cookie, even when it was unknown.
  app.post("/account/sign-out", async (c) => {
    if (!sameOrigin(c, accounts.allowedOrigins)) return c.body(null, 403, NO_STORE);
    const token = getCookie(c, DEVICE_COOKIE);
    if (token) await accounts.signOutDevice(token);
    deleteCookie(c, DEVICE_COOKIE, { path: "/", secure: accounts.secureCookie, httpOnly: true, sameSite: "Lax" });
    return c.body(null, 204, NO_STORE);
  });

  return app;
};
