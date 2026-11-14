/**
 * The Cloudflare Worker (ADR-0020 §1, `platform/09`): runs before the static assets (`run_worker_first`),
 * refuses with 503 a bad configuration (BR-111), 400 a request without one valid `CF-Connecting-IP`, 401 or
 * 403 a missing or wrong Access token (BR-113) and 403 a WebSocket from another Origin, then serves the
 * assets with the BR-086 headers or forwards the request to the single Hub Durable Object. It never touches
 * storage and never builds the hub.
 */
import { Hono } from "hono";
import { isIpAddress } from "../../domain";
import { securityHeaders } from "../../server/app";
import { ACCESS_HEADER, createAccessVerifier, type AccessVerifier } from "./access";
import { cachedConfig, type Config, type Env } from "./env";

export { HubObject } from "./hub-object";

/** BR-111: the one client IP Cloudflare's edge sets; `undefined` when absent, repeated or not an address. */
export const clientIp = (request: Request): string | undefined => {
  const value = request.headers.get("cf-connecting-ip") ?? "";
  return isIpAddress(value) ? value : undefined;
};

/** Paths the Hub answers (`createApp`, `addModeratorRoutes`, the upgrade); everything else is an asset. */
export const isHubPath = (pathname: string): boolean =>
  pathname === "/ws" || ["/api/", "/account/", "/mod/", "/owner/"].some((prefix) => pathname.startsWith(prefix));

/** The audience the Access token must carry on this path (BR-113). */
export const audienceFor = (pathname: string, config: Pick<Config, "accessAudSite" | "accessAudOwner">): string =>
  pathname.startsWith("/owner/") ? config.accessAudOwner : config.accessAudSite;

/** The single Hub object, in the EU jurisdiction (D6 A). */
const hubStub = (env: Env) => {
  const namespace = env.HUB.jurisdiction("eu");
  return namespace.get(namespace.idFromName("hub"));
};

/** BR-086 headers exactly as the Hono app sets them, captured once per isolate; HSTS always (BR-111). */
let br086: Promise<readonly (readonly [string, string])[]> | undefined;
const securityHeaderList = () => {
  br086 ??= Promise.resolve(new Hono().use("*", securityHeaders(true)).all("*", (c) => c.body(null)).request("/")).then((response) => [...response.headers.entries()]);
  return br086;
};

/** A copy carrying the BR-086 headers (responses of `fetch` are immutable on Workers). */
const withSecurityHeaders = async (response: Response): Promise<Response> => {
  const copy = new Response(response.body, response);
  for (const [name, value] of await securityHeaderList()) copy.headers.set(name, value);
  return copy;
};

/** One verifier per team domain and isolate, so the JWKS cache lives as long as the isolate. */
const verifiers = new Map<string, AccessVerifier>();
const verifierFor = (teamDomain: string, fetcher?: typeof fetch): AccessVerifier => {
  let verifier = verifiers.get(teamDomain);
  if (!verifier) {
    verifier = createAccessVerifier({ teamDomain, fetch: fetcher });
    verifiers.set(teamDomain, verifier);
  }
  return verifier;
};

const refusal = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** The checks and the routing, before the BR-086 headers. */
const route = async (request: Request, env: Env, jwksFetch?: typeof fetch): Promise<Response> => {
  const config = await cachedConfig(env);
  if ("problem" in config) {
    console.error("configuration refused (BR-111)", config.problem);
    return refusal(503, { "Retry-After": "60" });
  }
  if (clientIp(request) === undefined) return refusal(400);
  const { pathname } = new URL(request.url);
  const verdict = await verifierFor(config.accessTeamDomain, jwksFetch).verify(request.headers.get(ACCESS_HEADER) ?? undefined, audienceFor(pathname, config));
  if (verdict !== "ok") return refusal(verdict === "invalid" ? 401 : 403);
  if (pathname === "/ws") {
    const origin = request.headers.get("origin");
    if (origin === null || !config.allowedOrigins.includes(origin)) return refusal(403);
  }
  return isHubPath(pathname) ? hubStub(env).fetch(request) : env.ASSETS.fetch(request);
};

/** Builds the Worker's handler; tests pass their own JWKS `fetch`. */
export const createWorker = (options: { readonly jwksFetch?: typeof fetch } = {}) => ({
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await route(request, env, options.jwksFetch);
    // A 101 carries the client socket: returned as is, it is not a document (BR-086).
    return response.status === 101 ? response : withSecurityHeaders(response);
  },
});

/** The Workers runtime loads the module's default export; the platform imposes it. */
export default createWorker();
