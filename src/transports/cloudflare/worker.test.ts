import { describe, expect, it } from "vitest";
import { ACCESS_HEADER } from "./access";
import type { Fetcher } from "./env";
import { audienceFor, clientIp, createWorker, isHubPath } from "./worker";
import { AUD_OWNER, AUD_SITE, claims, createSigner, jwksServer, validEnv } from "./test-env";

const signer = await createSigner();
const jwks = jwksServer(() => [signer.jwk]);
const worker = createWorker({ jwksFetch: jwks.fetch });

const recorder = (status = 200) => {
  const seen: string[] = [];
  const fetcher: Fetcher = {
    fetch: (request) => {
      seen.push(new URL(request.url).pathname);
      return Promise.resolve(new Response("body", { status, headers: { "Content-Type": "text/plain" } }));
    },
  };
  return { seen, fetcher };
};

const request = async (path: string, options: { aud?: string; ip?: string | null; origin?: string; upgrade?: boolean; token?: string } = {}) => {
  const headers = new Headers();
  if (options.ip !== null) headers.set("cf-connecting-ip", options.ip ?? "203.0.113.7");
  const token = options.token ?? (await signer.sign(claims(options.aud ?? AUD_SITE)));
  if (token) headers.set(ACCESS_HEADER, token);
  if (options.origin) headers.set("origin", options.origin);
  if (options.upgrade) headers.set("upgrade", "websocket");
  return new Request(`https://staging.asvchat.fr${path}`, { headers });
};

describe("Worker checks (BR-111, BR-113)", () => {
  it("serves assets and forwards hub paths, with the BR-086 headers", async () => {
    const hub = recorder();
    const assets = recorder();
    const env = validEnv({}, hub.fetcher, assets.fetcher);

    const page = await worker.fetch(await request("/"), env);
    const api = await worker.fetch(await request("/api/rooms"), env);

    expect(page.status).toBe(200);
    expect(await page.text()).toBe("body");
    expect(assets.seen).toEqual(["/"]);
    expect(hub.seen).toEqual(["/api/rooms"]);
    for (const response of [page, api]) {
      expect(response.headers.get("strict-transport-security")).toContain("max-age=");
      expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });

  it("answers 503 to a bad configuration, with the headers", async () => {
    const response = await worker.fetch(await request("/"), validEnv({ BREVO_API_KEY: undefined }));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it.each([null, "", "not-an-ip", "203.0.113.7, 198.51.100.1"])("answers 400 without one valid client IP (%s)", async (ip) => {
    const response = await worker.fetch(await request("/", { ip }), validEnv());
    expect(response.status).toBe(400);
  });

  it("answers 401 without a valid token and 403 for the wrong application", async () => {
    const env = validEnv({}, recorder().fetcher, recorder().fetcher);
    expect((await worker.fetch(await request("/", { token: "x.y.z" }), env)).status).toBe(401);
    expect((await worker.fetch(await request("/owner/moderators", { aud: AUD_SITE }), env)).status).toBe(403);
    expect((await worker.fetch(await request("/owner/moderators", { aud: AUD_OWNER }), env)).status).toBe(200);
    expect((await worker.fetch(await request("/", { aud: AUD_OWNER }), env)).status).toBe(403);
  });

  it("answers 403 to a WebSocket from another or no Origin", async () => {
    const hub = recorder();
    const env = validEnv({}, hub.fetcher);
    expect((await worker.fetch(await request("/ws", { upgrade: true, origin: "https://evil.fr" }), env)).status).toBe(403);
    expect((await worker.fetch(await request("/ws", { upgrade: true }), env)).status).toBe(403);
    expect((await worker.fetch(await request("/ws", { upgrade: true, origin: "https://asvchat.fr" }), env)).status).toBe(200);
    expect(hub.seen).toEqual(["/ws"]);
  });

  it("returns a 101 from the hub untouched", async () => {
    const upgraded = { status: 101, headers: new Headers() } as Response;
    const env = validEnv({}, { fetch: () => Promise.resolve(upgraded) });
    expect(await worker.fetch(await request("/ws", { upgrade: true, origin: "https://staging.asvchat.fr" }), env)).toBe(upgraded);
  });
});

describe("Worker helpers", () => {
  it("reads one client IP, v4 or v6", () => {
    const ip = (value: string) => clientIp(new Request("https://x/", { headers: { "cf-connecting-ip": value } }));
    expect(ip("2001:db8::1")).toBe("2001:db8::1");
    expect(ip("203.0.113.7")).toBe("203.0.113.7");
    expect(ip("evil")).toBeUndefined();
  });

  it("routes hub paths and picks the audience per path", () => {
    expect(["/ws", "/api/x", "/account/x", "/mod/x", "/owner/x"].every(isHubPath)).toBe(true);
    expect(["/", "/index.html", "/wsx", "/assets/a.js", "/owner"].some(isHubPath)).toBe(false);
    const config = { accessAudSite: AUD_SITE, accessAudOwner: AUD_OWNER };
    expect(audienceFor("/owner/moderators", config)).toBe(AUD_OWNER);
    expect(audienceFor("/mod/queue", config)).toBe(AUD_SITE);
  });
});
