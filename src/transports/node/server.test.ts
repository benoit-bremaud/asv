import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createMemoryLog } from "./memory-log";
import { createNodeRandom } from "./random";
import { startNodeServer, type NodeServer } from "./server";

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
  return { ws, next, send };
};

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
