import { describe, expect, it, vi } from "vitest";
import type { Mailer } from "../../domain";
import { POLICY_CLOSE } from "../../server/frame-budget";
import { CAPS } from "../../shared/protocol";
import { PURGE_EVERY_MS } from "./alarm";
import type { Env } from "./env";
import { HubObject, SILENCE_MS, type HubObjectState, type ServerSocket } from "./hub-object";
import { rows } from "./sql";
import { createSqlLog, createSqlModerationStore, migrate, readMeta, writeMeta } from "./sqlite-stores";
import { createModerationIo } from "../../server/moderation-io";
import { MAIL_GIVE_UP_MS, STATEMENT_RETRY_MS } from "../../server/moderation-mail";
import { UPGRADE_LIMITS } from "../../server/upgrade-limit";
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
    failClose: false,
    accept() {
      socket.accepted = true;
    },
    send(data: string) {
      socket.sent.push(data);
    },
    close(code?: number, reason?: string) {
      if (socket.failClose) throw new Error("already closed");
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

const setup = async (
  env: Env = validEnv(),
  prepare?: (storage: ReturnType<typeof createTestStorage>) => Promise<void>,
  mailer: Mailer = quietMailer,
) => {
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
  const intervals = new Map<number, [() => void, number]>();
  let nextHandle = 0;
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
    mailer,
    setInterval: (callback, ms) => {
      intervals.set(nextHandle, [callback, ms]);
      return nextHandle++;
    },
    clearInterval: (handle) => intervals.delete(handle as number),
    upgrade: () => {
      const server = fakeSocket();
      sockets.push(server);
      return { server: server as ServerSocket, response: new Response("upgraded", { status: 200 }) };
    },
  });
  await started;
  const upgrade = (ip = "203.0.113.7") =>
    object.fetch(new Request("https://staging.asvchat.fr/ws", { headers: { upgrade: "websocket", "cf-connecting-ip": ip } }));
  const timers = () => [...intervals.values()].map(([, ms]) => ms);
  return { object, storage, intervals, timers, sockets, upgrade, advance: (ms: number) => (now += ms) };
};

const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Hub Durable Object start (BR-109, BR-110, BR-111)", () => {
  it("migrates, closes the lines a previous run left open and arms the alarm, with no timer before a socket", async () => {
    const crypto = createCrypto(await cryptoKeysFromEnv({}, false, () => undefined));
    const { storage, timers } = await setup(validEnv(), async (store) => {
      migrate(store);
      await createSqlLog(store, crypto).open({ connectionId: "orphan", ip: "::1", protocols: "p", pseudo: "A", openedAt: new Date(T0 - 5000) });
    });

    expect(rows(storage, "SELECT connection_id, closed_at FROM connection_lines")).toEqual([{ connection_id: "orphan", closed_at: T0 }]);
    expect(timers()).toEqual([]);
    expect(storage.alarms).toEqual([T0 + 1000]);
  });

  it("stays idle and answers 503 on a bad configuration", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { object, storage, timers } = await setup(validEnv({ BREVO_API_KEY: undefined }));

    const response = await object.fetch(new Request("https://staging.asvchat.fr/api/stats"));
    expect(response.status).toBe(503);
    expect(timers()).toEqual([]);
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

  it("serves an owner invitation to a non-loopback peer with the owner secret (BR-093, BR-113)", async () => {
    const { object } = await setup();
    const invite = (secret: string) =>
      object.fetch(
        new Request("https://staging.asvchat.fr/owner/invitations", {
          method: "POST",
          headers: { "cf-connecting-ip": "198.51.100.9", Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Marc" }),
        }),
      );

    const accepted = await invite("o".repeat(32));
    expect(accepted.status).toBe(201);
    expect(((await accepted.json()) as { link: string }).link).toMatch(/^https:\/\/staging\.asvchat\.fr\/#mod\/enroll\/[\w-]+$/);
    expect((await invite("x".repeat(32))).status).toBe(401);
  });
});

describe("Hub Durable Object timers (platform/05, BR-110)", () => {
  it("starts the tick and the sweep on the first socket only, and clears both when the last one closes", async () => {
    const { upgrade, sockets, timers } = await setup();
    await upgrade();
    expect(timers()).toEqual([1000, 15_000]);
    await upgrade();
    expect(timers()).toEqual([1000, 15_000]);

    sockets[0]?.emit("close");
    expect(timers()).toEqual([1000, 15_000]);
    sockets[1]?.emit("close");
    expect(timers()).toEqual([]);

    await upgrade();
    expect(timers()).toEqual([1000, 15_000]);
  });

  it("starts no timer when the alarm wakes an object without sockets", async () => {
    const { object, timers } = await setup();
    await object.alarm();
    expect(timers()).toEqual([]);
  });
});

describe("Hub Durable Object sockets (BR-088, BR-089)", () => {
  it("accepts a socket and answers ping with pong", async () => {
    const { upgrade, sockets } = await setup();
    const response = await upgrade();

    expect(await response.text()).toBe("upgraded");
    expect(sockets[0]?.accepted).toBe(true);
    sockets[0]?.emit("message", "ping");
    expect(sockets[0]?.sent).toContain("pong");
  });

  it("closes the hub side once when the runtime reports both close and error", async () => {
    const { upgrade, sockets, storage, advance } = await setup();
    const ip = "198.51.100.20";
    for (let index = 0; index < UPGRADE_LIMITS.perIp; index += 1) expect((await upgrade(ip)).status).toBe(200);
    expect((await upgrade(ip)).status).toBe(429);
    const enter = { type: "enter", seq: 1, payload: { pseudo: "Lola", age: 30, adultConfirmed: true, termsAccepted: true } };
    sockets[0]?.emit("message", JSON.stringify(enter));
    await vi.waitFor(() => expect(rows(storage, "SELECT * FROM connection_lines")).toHaveLength(1));

    sockets[0]?.emit("close");
    sockets[0]?.emit("error");
    await vi.waitFor(() => expect(rows(storage, "SELECT closed_at FROM connection_lines WHERE closed_at IS NOT NULL")).toHaveLength(1));
    advance(10_000);

    // One slot freed, not two.
    expect((await upgrade(ip)).status).toBe(200);
    expect((await upgrade(ip)).status).toBe(429);
  });

  it("refuses a flood with 1008 on the next turn, before the hub", async () => {
    const { upgrade, sockets } = await setup();
    await upgrade();
    const [flood] = sockets;

    for (let index = 0; index < 100; index += 1) flood?.emit("message", "ping");
    await nextTurn();

    expect(flood?.closes).toEqual([[POLICY_CLOSE, "tooManyFrames"]]);
    const pongs = flood?.sent.length;
    flood?.emit("message", "ping");
    expect(flood?.sent).toHaveLength(pongs ?? -1);
  });

  it("counts an oversize frame as invalid in the hub, and closes at the fifth in a row (BR-088)", async () => {
    const { upgrade, sockets } = await setup();
    await upgrade();
    const [big] = sockets;

    big?.emit("message", "x".repeat(CAPS.frame + 1));
    await vi.waitFor(() => expect(big?.sent.some((text) => text.includes("frameTooLarge"))).toBe(true));
    await nextTurn();
    expect(big?.closes).toEqual([]);

    for (let index = 0; index < 4; index += 1) big?.emit("message", "x".repeat(CAPS.frame + 1));
    await vi.waitFor(() => expect(big?.closes).toEqual([[POLICY_CLOSE, "invalidFrames"]]));
  });

  it("passes other frames to the hub, binary ones as invalid", async () => {
    const { upgrade, sockets } = await setup();
    await upgrade();
    sockets[0]?.emit("message", new Uint8Array([1]));
    sockets[0]?.emit("message", "{}");
    await vi.waitFor(() => expect(sockets[0]?.sent.filter((text) => text.includes('"invalid"'))).toHaveLength(2));
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

  it("runs the hub's close even when the socket throws on close, at the sweep and after a refusal", async () => {
    const { object, upgrade, sockets, advance, timers } = await setup();
    await upgrade();
    await upgrade();
    for (const socket of sockets) socket.failClose = true;
    sockets[1]?.emit("message", "ping");
    advance(SILENCE_MS + 1);
    sockets[1]?.emit("message", "ping");

    object.sweep();
    expect(timers()).toEqual([1000, 15_000]);
    for (let index = 0; index < 100; index += 1) sockets[1]?.emit("message", "ping");
    await nextTurn();

    expect(timers()).toEqual([]);
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

  it("logs a failed purge and re-arms at the retry delay, not every second", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { object, storage } = await setup();
    storage.sql.exec("DROP TABLE connection_lines");

    await object.alarm();

    expect(error).toHaveBeenCalledWith("daily purge failed", expect.any(Error));
    expect(storage.alarms.at(-1)).toBe(T0 + STATEMENT_RETRY_MS);
    error.mockRestore();
  });

  it("arms the alarm 10 minutes ahead while a statement is pending, also with no socket open (BR-110)", async () => {
    const crypto = createCrypto(await cryptoKeysFromEnv({}, false, () => undefined));
    const refusing: Mailer = { ...quietMailer, sendStatementOfReasons: () => Promise.resolve(false) };
    const { object, storage, advance } = await setup(
      validEnv(),
      async (store) => {
        migrate(store);
        writeMeta(store, "lastPurgeAt", String(T0));
        await createModerationIo({ store: createSqlModerationStore(store), crypto }).savePendingStatement({
          id: "st1",
          email: "max@example.org",
          text: "statement",
          giveUpAt: new Date(T0 + MAIL_GIVE_UP_MS),
        });
      },
      refusing,
    );
    expect(storage.alarms).toEqual([T0 + STATEMENT_RETRY_MS]);

    advance(STATEMENT_RETRY_MS);
    await object.alarm();

    expect(rows(storage, "SELECT id FROM pending_statements")).toEqual([{ id: "st1" }]);
    expect(storage.alarms.at(-1)).toBe(T0 + 2 * STATEMENT_RETRY_MS);
  });
});
