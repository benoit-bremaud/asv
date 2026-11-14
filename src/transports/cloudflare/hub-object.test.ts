import { describe, expect, it, vi } from "vitest";
import type { Mailer } from "../../domain";
import { POLICY_CLOSE } from "../../server/frame-budget";
import { CAPS } from "../../shared/protocol";
import { PURGE_EVERY_MS } from "./alarm";
import type { Env } from "./env";
import { HubObject, type HubObjectState, type ServerSocket } from "./hub-object";
import { rows } from "./sql";
import { createSqlLog, migrate, readMeta } from "./sqlite-stores";
import { createCrypto } from "../../server/crypto/cipher";
import { cryptoKeysFromEnv } from "../../server/crypto/keys";
import { createTestStorage } from "./test-sqlite";
import { validEnv } from "./test-env";

const T0 = Date.UTC(2026, 10, 14, 10);

const fakeSocket = () => {
  const listeners = new Map<string, ((event: { data: unknown }) => void)[]>();
  const socket = {
    accepted: false,
    sent: [] as string[],
    closes: [] as (number | string | undefined)[][],
    accept() {
      socket.accepted = true;
    },
    send(data: string) {
      socket.sent.push(data);
    },
    close(code?: number, reason?: string) {
      socket.closes.push([code, reason]);
    },
    addEventListener(type: string, listener: (event: { data: unknown }) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    emit(type: string, data?: unknown) {
      for (const listener of listeners.get(type) ?? []) listener({ data });
    },
  };
  return socket;
};

const quietMailer: Mailer = {
  sendCode: () => Promise.resolve(),
  sendStatementOfReasons: () => Promise.resolve(true),
  sendAuthorityAlert: () => Promise.resolve(true),
  sendReportDecision: () => Promise.resolve(true),
};

const setup = async (env: Env = validEnv(), prepare?: (storage: ReturnType<typeof createTestStorage>) => Promise<void>) => {
  let now = T0;
  const storage = Object.assign(createTestStorage(), {
    alarms: [] as number[],
    setAlarm(at: number) {
      storage.alarms.push(at);
      return Promise.resolve();
    },
    getAlarm: () => Promise.resolve(storage.alarms.at(-1) ?? null),
  });
  await prepare?.(storage);
  let started: Promise<unknown> = Promise.resolve();
  const intervals: [() => void, number][] = [];
  const sockets: ReturnType<typeof fakeSocket>[] = [];
  const ctx: HubObjectState = {
    storage,
    blockConcurrencyWhile: (callback) => {
      const promise = callback();
      started = promise;
      return promise;
    },
  };
  const object = new HubObject(ctx, env, {
    now: () => new Date(now),
    mailer: quietMailer,
    setInterval: (callback, ms) => intervals.push([callback, ms]),
    upgrade: () => {
      const server = fakeSocket();
      sockets.push(server);
      return { server: server as ServerSocket, response: new Response("upgraded", { status: 200 }) };
    },
  });
  await started;
  const upgrade = (ip = "203.0.113.7") =>
    object.fetch(new Request("https://staging.asvchat.fr/ws", { headers: { upgrade: "websocket", "cf-connecting-ip": ip } }));
  return { object, storage, intervals, sockets, upgrade, advance: (ms: number) => (now += ms) };
};

const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Hub Durable Object start (BR-109, BR-110, BR-111)", () => {
  it("migrates, closes the lines a previous run left open, starts the timers and arms the alarm", async () => {
    const crypto = createCrypto(await cryptoKeysFromEnv({}, false, () => undefined));
    const { storage, intervals } = await setup(validEnv(), async (store) => {
      migrate(store);
      await createSqlLog(store, crypto).open({ connectionId: "orphan", ip: "::1", protocols: "p", pseudo: "A", openedAt: new Date(T0 - 5000) });
    });

    expect(rows(storage, "SELECT connection_id, closed_at FROM connection_lines")).toEqual([{ connection_id: "orphan", closed_at: T0 }]);
    expect(intervals.map(([, ms]) => ms)).toEqual([1000, 15_000]);
    expect(storage.alarms).toEqual([T0 + 1000]);
  });

  it("stays idle and answers 503 on a bad configuration", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { object, storage, intervals } = await setup(validEnv({ BREVO_API_KEY: undefined }));

    const response = await object.fetch(new Request("https://staging.asvchat.fr/api/stats"));
    expect(response.status).toBe(503);
    expect(intervals).toEqual([]);
    expect(rows(storage, "SELECT name FROM sqlite_master WHERE name = 'meta'")).toEqual([]);
    await object.alarm();
    await object.tick();
    error.mockRestore();
  });

  it("serves the app routes and hides /mod while moderation is off (BR-108)", async () => {
    const on = await setup();
    const off = await setup(validEnv({ ASV_MODERATION: "off" }));

    expect((await on.object.fetch(new Request("https://staging.asvchat.fr/api/stats"))).status).toBe(200);
    expect((await off.object.fetch(new Request("https://staging.asvchat.fr/mod/status"))).status).toBe(404);
    expect((await on.object.fetch(new Request("https://staging.asvchat.fr/mod/status"))).status).toBe(200);
  });
});

describe("Hub Durable Object sockets (BR-088, BR-089)", () => {
  it("accepts a socket, answers ping with pong, and closes the hub side once", async () => {
    const { upgrade, sockets } = await setup();
    const response = await upgrade();

    expect(await response.text()).toBe("upgraded");
    const [socket] = sockets;
    expect(socket?.accepted).toBe(true);
    socket?.emit("message", "ping");
    expect(socket?.sent).toContain("pong");
    socket?.emit("close");
    socket?.emit("error");
  });

  it("refuses an oversize frame and a flood with 1008 on the next turn", async () => {
    const { upgrade, sockets } = await setup();
    await upgrade();
    await upgrade();
    const [big, flood] = sockets;

    big?.emit("message", "x".repeat(CAPS.frame + 1));
    for (let index = 0; index < 100; index += 1) flood?.emit("message", "ping");
    await nextTurn();

    expect(big?.closes).toEqual([[POLICY_CLOSE, "invalidFrames"]]);
    expect(flood?.closes).toEqual([[POLICY_CLOSE, "tooManyFrames"]]);
    big?.emit("message", "ping");
    expect(big?.sent).not.toContain("pong");
  });

  it("passes other frames to the hub, binary ones as invalid", async () => {
    const { upgrade, sockets } = await setup();
    await upgrade();
    sockets[0]?.emit("message", new Uint8Array([1]));
    sockets[0]?.emit("message", "{}");
    await nextTurn();
    expect(sockets[0]?.accepted).toBe(true);
  });

  it("runs a chatter through the hub: entry answered on the socket, connection line written encrypted", async () => {
    const { upgrade, sockets, storage } = await setup(validEnv({ ASV_MISTRAL_API_KEY: "mistral-test" }));
    await upgrade();
    const enter = { type: "enter", seq: 1, payload: { pseudo: "Lola", gender: "woman", age: 30, adultConfirmed: true, termsAccepted: true } };

    sockets[0]?.emit("message", JSON.stringify(enter));
    await vi.waitFor(() => expect(sockets[0]?.sent.some((text) => text.includes('"entered"'))).toBe(true));

    const lines = rows(storage, "SELECT * FROM connection_lines");
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toMatch(/Lola|203\.0\.113\.7|woman/);
    sockets[0]?.emit("close");
    await vi.waitFor(() => expect(rows(storage, "SELECT closed_at FROM connection_lines")[0]?.closed_at).not.toBeNull());
  });

  it("answers 429 with Retry-After once one IP opens too many sockets", async () => {
    const { upgrade } = await setup();
    const statuses: number[] = [];
    for (let index = 0; index < 30; index += 1) statuses.push((await upgrade("198.51.100.4")).status);

    const refused = statuses.findIndex((status) => status !== 200);
    expect(refused).toBeGreaterThan(0);
    expect(statuses[refused]).toBe(429);
  });

  it("closes a socket silent for 60 seconds at the sweep, not a live one", async () => {
    const { object, upgrade, sockets, advance } = await setup();
    await upgrade();
    await upgrade();
    advance(45_000);
    sockets[1]?.emit("message", "ping");
    advance(20_000);

    object.sweep();
    await object.tick();

    expect(sockets[0]?.closes).toEqual([[undefined, undefined]]);
    expect(sockets[1]?.closes).toEqual([]);
  });
});

describe("Hub Durable Object alarm (BR-110)", () => {
  it("purges once a day and re-arms for the next purge", async () => {
    const { object, storage } = await setup();

    await object.alarm();
    expect(readMeta(storage, "lastPurgeAt")).toBe(String(T0));
    expect(storage.alarms.at(-1)).toBe(T0 + PURGE_EVERY_MS);

    await object.alarm();
    expect(readMeta(storage, "lastPurgeAt")).toBe(String(T0));
  });

  it("logs a failed purge and still re-arms", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { object, storage } = await setup();
    storage.sql.exec("DROP TABLE connection_lines");

    await object.alarm();

    expect(error).toHaveBeenCalledWith("daily purge failed", expect.any(Error));
    expect(storage.alarms.length).toBeGreaterThan(1);
    error.mockRestore();
  });
});
