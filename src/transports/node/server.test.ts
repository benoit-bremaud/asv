import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { createMemoryLog } from "./memory-log";
import { createNodeRandom } from "./random";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clientAddress, startNodeServer, type NodeServer } from "./server";

const ORIGIN = "http://localhost:5173";
const FRAME_MS = 2000;
let server: NodeServer | undefined;

afterEach(async () => {
  await server?.stop();
  server = undefined;
});

const start = async (overrides: object = {}) => {
  server = await startNodeServer({ port: 0, hostname: "127.0.0.1", allowedOrigins: [ORIGIN], ...overrides });
  return server;
};

/** A client socket that queues every frame it receives. */
const connect = async (port: number, origin = ORIGIN, path = "/ws") => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { origin });
  const frames: string[] = [];
  const waiters: (() => void)[] = [];
  ws.on("message", (data) => {
    frames.push(data.toString());
    waiters.splice(0).forEach((wake) => wake());
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  /** Next frame matching `type` (or raw text); fails with the awaited type after `FRAME_MS`. */
  const next = async (type: string): Promise<{ type: string; payload: Record<string, unknown> } | string> => {
    const deadline = Date.now() + FRAME_MS;
    for (;;) {
      const index = frames.findIndex((f) => f === type || (f.startsWith("{") && JSON.parse(f).type === type));
      if (index >= 0) {
        const [frame] = frames.splice(index, 1);
        return frame === type ? frame : JSON.parse(frame as string);
      }
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`no "${type}" frame within ${FRAME_MS} ms`);
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
        setTimeout(resolve, left);
      });
    }
  };
  const send = (type: string, payload: object, seq = 1) => ws.send(JSON.stringify({ type, seq, payload }));
  return { ws, next, send, frames };
};

/** The status and `Retry-After` of a refused upgrade, or undefined when the socket opened (then closed). */
const refusal = (port: number) =>
  new Promise<{ status: number; retryAfter: string | undefined } | undefined>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: ORIGIN });
    ws.once("unexpected-response", (_request, response) => {
      resolve({ status: response.statusCode ?? 0, retryAfter: response.headers["retry-after"] });
      ws.terminate();
    });
    ws.once("open", () => {
      ws.close();
      resolve(undefined);
    });
    ws.once("error", (error) => (error.message.includes("Unexpected server response") ? undefined : reject(error)));
  });

/** Polls `check` until it holds, for at most `FRAME_MS`. */
const waitFor = async (check: () => Promise<boolean>) => {
  const deadline = Date.now() + FRAME_MS;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`condition not met within ${FRAME_MS} ms`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

/** A raw upgrade request to `/ws`, with or without a `Sec-WebSocket-Key`. */
const UPGRADE_REQUEST = (key: string | undefined) =>
  [
    "GET /ws HTTP/1.1",
    "Host: 127.0.0.1",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Origin: ${ORIGIN}`,
    "Sec-WebSocket-Version: 13",
    ...(key ? [`Sec-WebSocket-Key: ${key}`] : []),
    "",
    "",
  ].join("\r\n");

const ENTER = { gender: "woman", age: 30, adultConfirmed: true, termsAccepted: true };

describe("Node transport", () => {
  it("enters over the WebSocket, logs the connection and serves the stats", async () => {
    const { port, log } = await start();
    const lola = await connect(port);

    lola.send("enter", { pseudo: "Lola", ...ENTER });

    expect(await lola.next("entered")).toMatchObject({ payload: { isModerator: false } });
    expect(log.lines()).toMatchObject([{ kind: "connection", ip: "127.0.0.1", pseudo: "Lola", protocols: "HTTP/1.1 WebSocket" }]);
    const stats = await fetch(`http://127.0.0.1:${port}/api/stats`);
    expect(await stats.json()).toEqual({ connected: 1 });
  });

  it("answers ping with pong", async () => {
    const { port } = await start();
    const client = await connect(port);

    client.ws.send("ping");

    expect(await client.next("pong")).toBe("pong");
  });

  it.each([
    ["another origin", "http://evil.example", "/ws"],
    ["another path", ORIGIN, "/other"],
  ])("refuses an upgrade from %s", async (_case, origin, path) => {
    const { port } = await start();

    await expect(connect(port, origin, path)).rejects.toThrow(/403/);
  });

  it("closes a socket that sends a frame over 64 KiB (#13)", async () => {
    const { port } = await start();
    const client = await connect(port);
    const closed = new Promise<number>((resolve) => client.ws.once("close", resolve));

    client.ws.send("x".repeat(65_537));

    expect(await closed).toBe(1009);
  });

  it("closes with 1008 a socket that floods frames and answers none past its budget (BR-088)", async () => {
    const { port } = await start();
    const client = await connect(port);
    const closed = new Promise<[number, string]>((resolve) => client.ws.once("close", (code, reason) => resolve([code, reason.toString()])));

    for (let i = 0; i < 200; i += 1) client.ws.send("ping");

    expect(await closed).toEqual([1008, "tooManyFrames"]);
    // 40 in the burst, at most one more refilled while the frames arrive.
    expect(client.frames.filter((f) => f === "pong").length).toBeGreaterThanOrEqual(40);
    expect(client.frames.filter((f) => f === "pong").length).toBeLessThanOrEqual(41);
  });

  it("refuses a 21st socket of one IP with 429 while its budget is full, and lets it in once one closes (BR-089)", async () => {
    let clock = Date.parse("2026-11-05T10:00:00Z");
    const { port } = await start({ now: () => new Date(clock) });
    const open = await Promise.all(Array.from({ length: 20 }, () => connect(port)));
    // A full budget again: only the per-IP cap can refuse.
    clock += 60_000;

    expect(await refusal(port)).toEqual({ status: 429, retryAfter: "10" });

    const closed = new Promise((resolve) => open[0]?.ws.once("close", resolve));
    open[0]?.ws.close();
    await closed;
    clock += 60_000;
    await waitFor(async () => (await refusal(port)) === undefined);
  });

  it("refuses an upgrade loop with 429 once the per-IP budget is spent (BR-089)", async () => {
    const { port } = await start({ now: () => new Date("2026-11-05T10:00:00Z") });
    for (let i = 0; i < 20; i += 1) {
      const client = await connect(port);
      const closed = new Promise((resolve) => client.ws.once("close", resolve));
      client.ws.close();
      await closed;
    }

    expect(await refusal(port)).toEqual({ status: 429, retryAfter: "10" });
  });

  it("destroys a refused socket even when the peer never closes its side (BR-089)", async () => {
    const { port } = await start({ now: () => new Date("2026-11-05T10:00:00Z") });
    for (let i = 0; i < 20; i += 1) await refusal(port);

    const raw = createConnection({ port, host: "127.0.0.1", allowHalfOpen: true });
    let answer = "";
    raw.on("data", (chunk) => (answer += chunk.toString()));
    // Writing after the server's FIN: a destroyed server socket answers with a reset, so a later write fails.
    const reset = new Promise<void>((resolve) => raw.once("error", () => resolve()));
    raw.once("end", () => {
      const poke = setInterval(() => raw.write("still here"), 20);
      raw.once("close", () => clearInterval(poke));
    });
    raw.write(UPGRADE_REQUEST("dGhlIHNhbXBsZSBub25jZQ=="));

    await reset;
    expect(answer).toMatch(/^HTTP\/1\.1 429 Too Many Requests\r\nRetry-After: 10\r\n/);
  });

  it("gives the place back when ws refuses the handshake after the limiter admitted it (BR-089)", async () => {
    let clock = Date.parse("2026-11-05T10:00:00Z");
    const { port } = await start({ now: () => new Date(clock) });
    for (let i = 0; i < 20; i += 1) {
      const raw = createConnection({ port, host: "127.0.0.1" });
      const closed = new Promise<void>((resolve) => raw.once("close", () => resolve()));
      raw.on("data", () => undefined);
      // No Sec-WebSocket-Key: `ws` answers 400 and destroys the socket.
      raw.write(UPGRADE_REQUEST(undefined));
      await closed;
    }
    clock += 60_000;

    expect(await refusal(port)).toBeUndefined();
  });

  it("closes with 1008 a socket after five invalid frames in a row (BR-088)", async () => {
    const { port } = await start();
    const client = await connect(port);
    const closed = new Promise<[number, string]>((resolve) => client.ws.once("close", (code, reason) => resolve([code, reason.toString()])));

    for (let i = 0; i < 5; i += 1) client.ws.send("{");

    expect(await closed).toEqual([1008, "invalidFrames"]);
    expect(client.frames).toHaveLength(5);
  });

  it("marks a member away when its socket closes, and closes its line", async () => {
    const { port, log } = await start();
    const lola = await connect(port);
    const max = await connect(port);
    lola.send("enter", { pseudo: "Lola", ...ENTER });
    max.send("enter", { pseudo: "Max", ...ENTER });
    await lola.next("entered");
    await max.next("entered");
    lola.send("joinRoom", { roomId: "lyon" });
    await lola.next("roomJoined");
    max.send("joinRoom", { roomId: "lyon" });
    await lola.next("memberJoined");

    max.ws.close();

    expect(await lola.next("memberAway")).toMatchObject({ payload: { roomId: "lyon", pseudo: "Max" } });
    expect(log.lines().find((line) => line.kind === "connection" && line.pseudo === "Max")).toHaveProperty("closedAt");
  });

  it("closes the socket displaced by a resume takeover", async () => {
    const { port } = await start();
    const old = await connect(port);
    old.send("enter", { pseudo: "Lola", ...ENTER });
    const entered = await old.next("entered");
    const resumeToken = typeof entered === "string" ? "" : String(entered.payload.resumeToken);
    const closed = new Promise((resolve) => old.ws.once("close", resolve));
    const fresh = await connect(port);

    fresh.send("resume", { resumeToken, profile: { age: 30 } });

    expect(await fresh.next("resumed")).toMatchObject({ payload: { pseudo: "Lola" } });
    await closed;
  });

  it("terminates a silent socket and expires the away session (BR-010, BR-015)", async () => {
    let clock = Date.parse("2026-10-23T10:00:00Z");
    const { port, log } = await start({ now: () => new Date(clock), tickMs: 5, sweepMs: 5, silenceMs: 60_000 });
    const client = await connect(port);
    client.send("enter", { pseudo: "Lola", ...ENTER });
    await client.next("entered");
    const closed = new Promise((resolve) => client.ws.once("close", resolve));

    clock += 61_000;
    await closed;
    // The server handles the close on its own turn: wait for it before moving the clock again.
    await expect.poll(() => log.lines()[0], { timeout: FRAME_MS }).toHaveProperty("closedAt");
    clock += 5 * 60_000;
    await expect.poll(async () => (await fetch(`http://127.0.0.1:${port}/api/stats`)).json(), { timeout: FRAME_MS }).toEqual({ connected: 0 });
  });
});

describe("Node random", () => {
  it("draws distinct ids and tokens whose hash matches hashToken", () => {
    const random = createNodeRandom(Buffer.alloc(32, 1));
    const token = random.token();

    expect(random.id()).not.toBe(random.id());
    expect(token.value).toMatch(/^[\w-]{43}$/);
    expect(random.hashToken(token.value)).toBe(token.hash);
    expect(createNodeRandom(Buffer.alloc(32, 2)).hashToken(token.value)).not.toBe(token.hash);
  });
});

describe("memory log", () => {
  it("keeps the newest lines only and records the close time", async () => {
    const log = createMemoryLog(2);
    const at = new Date("2026-10-23T10:00:00Z");
    await log.open({ connectionId: "c1", ip: "ip", protocols: "p", pseudo: "a", openedAt: at });
    await log.open({ connectionId: "c2", ip: "ip", protocols: "p", pseudo: "b", openedAt: at });
    await log.appendContribution({ connectionId: "c2", protocols: "p", at });

    await log.close("c2", at);

    expect(log.lines()).toEqual([
      { kind: "connection", connectionId: "c2", ip: "ip", protocols: "p", pseudo: "b", openedAt: at, closedAt: at },
      { kind: "contribution", connectionId: "c2", protocols: "p", at },
    ]);
  });
});

describe("tester exposure (ADR-0018)", () => {
  const request = (header: string | string[] | undefined) =>
    ({ headers: header === undefined ? {} : { "cf-connecting-ip": header }, socket: { remoteAddress: "127.0.0.1", remotePort: 5555 } }) as unknown as IncomingMessage;

  it("takes one valid CF-Connecting-IP only behind the tunnel (BR-085)", () => {
    expect(clientAddress(request("203.0.113.7"), true)).toEqual({ ip: "203.0.113.7" });
    expect(clientAddress(request(" 2001:db8::1 "), true)).toEqual({ ip: "2001:db8::1" });
    expect(clientAddress(request("203.0.113.7"), false)).toEqual({ ip: "127.0.0.1", port: 5555 });
    expect(clientAddress(request("203.0.113.7, 198.51.100.1"), true)).toEqual({ ip: "127.0.0.1", port: 5555 });
    expect(clientAddress(request(["203.0.113.7", "198.51.100.1"]), true)).toEqual({ ip: "127.0.0.1", port: 5555 });
    expect(clientAddress(request(undefined), true)).toEqual({ ip: "127.0.0.1", port: 5555 });
  });

  const tunnelKeys = async () => {
    const b64 = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64");
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    return {
      ASV_DATA_KEYS: `1:${b64(crypto.getRandomValues(new Uint8Array(32)))}`,
      ASV_HMAC_KEY: b64(crypto.getRandomValues(new Uint8Array(32))),
      ASV_VAULT_PUBLIC_KEY: b64(await crypto.subtle.exportKey("raw", pair.publicKey)),
    };
  };

  it("refuses to start behind the tunnel without every ADR-0017 key", async () => {
    await expect(startNodeServer({ port: 0, hostname: "127.0.0.1", allowedOrigins: [ORIGIN], behindTunnel: true, logFile: "/tmp/never.jsonl", vaultFile: "/tmp/never2.jsonl", brevoApiKey: "k" })).rejects.toThrow(/missing secrets/);
  });

  it("refuses to start behind the tunnel without both legal files or a Brevo key (BR-084)", async () => {
    const base = { port: 0, hostname: "127.0.0.1", allowedOrigins: [ORIGIN], behindTunnel: true, cryptoEnv: await tunnelKeys() };
    await expect(startNodeServer({ ...base, vaultFile: "/tmp/never.jsonl", brevoApiKey: "k" })).rejects.toThrow(/logFile and vaultFile/);
    await expect(startNodeServer({ ...base, logFile: "/tmp/never.jsonl", brevoApiKey: "k" })).rejects.toThrow(/logFile and vaultFile/);
    await expect(startNodeServer({ ...base, logFile: "/tmp/never.jsonl", vaultFile: "/tmp/never2.jsonl" })).rejects.toThrow(/Brevo/);
  });

  it("refuses one file for both the log and the vault (BR-084)", async () => {
    await expect(start({ logFile: "/tmp/asv-same.jsonl", vaultFile: "/tmp/../tmp/asv-same.jsonl" })).rejects.toThrow(/different files/);
  });

  it("refuses to start behind the tunnel off loopback (BR-085)", async () => {
    await expect(startNodeServer({ port: 0, hostname: "0.0.0.0", allowedOrigins: [ORIGIN], behindTunnel: true })).rejects.toThrow(/loopback/);
  });

  it("purges the log at start-up, logs to the file and serves the build with the BR-086 headers in tunnel mode", async () => {
    const dir = mkdtempSync(join(tmpdir(), "asv-"));
    try {
      writeFileSync(join(dir, "index.html"), "<p>asv</p>");
      const logFile = join(dir, "log.jsonl");
      writeFileSync(logFile, '{"kind":"contribution","connectionId":"old","protocols":"p","at":"2020-01-01T00:00:00.000Z"}\n');
      const { port } = await start({ logFile, vaultFile: join(dir, "vault.jsonl"), behindTunnel: true, brevoApiKey: "test-key", secureCookie: true, staticRoot: dir, cryptoEnv: await tunnelKeys() });

      const page = await fetch(`http://127.0.0.1:${port}/`);
      expect(await page.text()).toBe("<p>asv</p>");
      expect(page.headers.get("strict-transport-security")).toBe("max-age=15552000");
      expect(page.headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(page.headers.get("x-content-type-options")).toBe("nosniff");
      expect(page.headers.get("permissions-policy")).toContain("camera=()");
      expect(readFileSync(logFile, "utf8")).not.toContain('"old"');

      const client = await connect(port);
      client.send("enter", { pseudo: "Lola", ...ENTER });
      await client.next("entered");
      expect(readFileSync(logFile, "utf8")).toContain('"pseudo":"Lola"');
      client.ws.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("moderator wiring (moderation/02f)", () => {
  const SECRET = "o".repeat(32);
  const invite = (port: number, secret = SECRET) =>
    fetch(`http://127.0.0.1:${port}/mod/invitations`, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Marc" }) });

  it("invites from loopback with the owner secret, on the default public origin", async () => {
    const { port } = await start({ ownerSecret: SECRET });

    const response = await invite(port);

    expect(response.status).toBe(201);
    expect(((await response.json()) as { link: string }).link).toMatch(/^http:\/\/localhost:5173\/#mod\/enroll\/[\w-]+$/);
    expect((await invite(port, "x".repeat(32))).status).toBe(401);
  });

  it("answers 404 on owner routes without a secret, while the status stays on", async () => {
    const { port } = await start();
    expect((await invite(port)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${port}/mod/status`)).status).toBe(200);
  });

  it.each([
    [{ ownerSecret: "short" }, /BR-093/],
    [{ moderatorFile: "/tmp/never-moderators.json" }, /BR-099/],
    [{ ownerSecret: "o".repeat(32), publicOrigin: "https://elsewhere.example" }, /BR-098/],
    [{ ownerSecret: "o".repeat(32), publicOrigin: "http://localhost:5173/" }, /BR-098/],
    [{ ownerSecret: "o".repeat(32), publicOrigin: "http://127.0.0.1:5173", allowedOrigins: ["http://127.0.0.1:5173"] }, /BR-098/],
    [{ ownerSecret: "o".repeat(32), publicOrigin: "http://[::1]:5173", allowedOrigins: ["http://[::1]:5173"] }, /BR-098/],
  ])("refuses to start with %j", async (overrides, message) => {
    await expect(start(overrides)).rejects.toThrow(message);
  });

  it("only warns on a mismatched public origin when moderation is not configured (local QA)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      await start({ allowedOrigins: ["http://127.0.0.1:8790"], ownerSecret: "" });

      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/BR-098/));
    } finally {
      warn.mockRestore();
    }
  });
});
