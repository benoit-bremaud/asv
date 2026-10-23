/**
 * Node transport (`platform/02-sequence-node-transport`): the Hono app over `@hono/node-server`, and the
 * WebSocket upgrade with `ws` (owner choice D1). Owns sockets, heartbeat and the clock; the hub does the rest.
 */
import { createAdaptorServer } from "@hono/node-server";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { createAccountIo } from "../../server/account-io";
import { createApp, DEVICE_COOKIE } from "../../server/app";
import { createCrypto } from "../../server/crypto/cipher";
import { cryptoKeysFromEnv, type CryptoEnv } from "../../server/crypto/keys";
import { createHub, type Outgoing } from "../../server/hub";
import { createBrevoMailer } from "../../server/mailer/brevo";
import { OFFICIAL_ROOMS } from "../../server/official-rooms";
import type { Mailer } from "../../domain";
import { CAPS } from "../../shared/protocol";
import { createMemoryAccountStore, createMemoryVault } from "./memory-accounts";
import { createMemoryLog } from "./memory-log";
import { createNodeRandom } from "./random";

/** Where the Node transport listens and how often it runs its timers. */
export interface NodeServerOptions {
  readonly port: number;
  readonly hostname: string;
  /** Exact `Origin` values allowed to open the WebSocket. */
  readonly allowedOrigins: readonly string[];
  /** Injected in tests; defaults to the wall clock. */
  readonly now?: () => Date;
  /** Milliseconds between hub ticks (away expiry, pruning); default 1000. */
  readonly tickMs?: number;
  /** Milliseconds between sweeps of silent sockets; default a quarter of `silenceMs`, so a dead socket goes within 1.25 × `silenceMs`. */
  readonly sweepMs?: number;
  /** Milliseconds after which a silent socket is terminated (BR-010); default 60 000. */
  readonly silenceMs?: number;
  /** Crypto secrets of ADR-0017; missing ones are generated for the process (development). */
  readonly cryptoEnv?: CryptoEnv;
  /** Brevo key and sender (ADR-0013); without a key, codes are logged (development). */
  readonly brevoApiKey?: string;
  readonly mailFrom?: string;
  /** Injected in tests to read the codes; Brevo otherwise. */
  readonly mailer?: Mailer;
}

/** A running Node transport: its bound port, its in-memory log (tests read it) and a graceful stop. */
export interface NodeServer {
  readonly port: number;
  readonly log: ReturnType<typeof createMemoryLog>;
  readonly accounts: ReturnType<typeof createMemoryAccountStore>;
  readonly vault: ReturnType<typeof createMemoryVault>;
  stop(): Promise<void>;
}

/** The raw device cookie of an upgrade request; the hub only ever gets its hash (`platform/04d`). */
const deviceCookie = (header: string | undefined): string | undefined => {
  for (const part of (header ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === DEVICE_COOKIE && value.length > 0) return value.join("=");
  }
  return undefined;
};

// The default `binaryType` ("nodebuffer") delivers one Buffer; the other shapes are typed, never sent.
const toText = (data: RawData): string => (Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)).toString();

/** Starts the Node transport and resolves once it listens. */
export const startNodeServer = async (options: NodeServerOptions): Promise<NodeServer> => {
  const { now = () => new Date(), tickMs = 1000, silenceMs = 60_000 } = options;
  const sweepMs = options.sweepMs ?? silenceMs / 4;
  const log = createMemoryLog();
  const random = createNodeRandom();
  const accounts = createMemoryAccountStore();
  const vault = createMemoryVault();
  const crypto = createCrypto(await cryptoKeysFromEnv(options.cryptoEnv ?? {}, false, (text) => console.warn(text)));
  const mailer = options.mailer ?? createBrevoMailer({
    apiKey: options.brevoApiKey,
    from: options.mailFrom ?? "contact@asvchat.fr",
    production: false,
    log: (level, fields) => (level === "error" ? console.error : console.info)("mailer", fields),
  });
  const hub = createHub({
    officialRooms: OFFICIAL_ROOMS,
    random,
    hashToken: random.hashToken,
    log,
    protocols: "HTTP/1.1 WebSocket",
    onLogError: (error) => console.error("connection log write failed", error),
    closeSocket: (key) => sockets.get(key)?.ws.close(),
    accounts: createAccountIo({ store: accounts, vault, crypto }),
    mailer,
    onStoreError: (error) => console.error("account store failed", error),
  });
  const app = createApp({
    stats: hub.stats,
    accounts: {
      allowedOrigins: options.allowedOrigins,
      // Development only: plain HTTP on 127.0.0.1 (`platform/04d`).
      secureCookie: false,
      redeemDeviceClaim: (claim) => hub.redeemDeviceClaim(claim, now()),
      signOutDevice: async (token) => deliver(await hub.signOutDevice(random.hashToken(token))),
    },
  });
  const server = createAdaptorServer({ fetch: app.fetch, hostname: options.hostname });
  const wss = new WebSocketServer({ noServer: true, maxPayload: CAPS.frame });
  const sockets = new Map<string, { ws: WebSocket; lastSeen: number }>();
  let nextKey = 0;

  const deliver = (out: readonly Outgoing[]) => {
    for (const { to, message } of out) {
      const text = JSON.stringify(message);
      for (const key of to) sockets.get(key)?.ws.send(text);
    }
  };
  const report = (error: unknown) => console.error("hub operation failed", error);
  const run = (task: Promise<Outgoing[]>) => task.then(deliver, report);

  wss.on("connection", (ws: WebSocket, request: IncomingMessage) => {
    const key = String(nextKey++);
    const entry = { ws, lastSeen: now().getTime() };
    sockets.set(key, entry);
    // Set on an open socket; empty only if it died before this line.
    const device = deviceCookie(request.headers.cookie);
    hub.open(key, request.socket.remoteAddress ?? "", request.socket.remotePort, device && random.hashToken(device));
    ws.on("message", (data, isBinary) => {
      entry.lastSeen = now().getTime();
      const text = toText(data);
      // Heartbeat answered here, like the Durable Object auto-response (ADR-0011).
      if (!isBinary && text === "ping") return ws.send("pong");
      void run(hub.receive(key, text, now()));
    });
    // Oversized or malformed frames: `ws` already closes the socket (1009, 1002); without a listener
    // the error would crash the process.
    ws.on("error", () => undefined);
    ws.on("close", () => {
      sockets.delete(key);
      void run(hub.close(key, now()));
    });
  });

  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const origin = request.headers.origin;
    if (request.url !== "/ws" || !origin || !options.allowedOrigins.includes(origin)) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  });

  const tick = setInterval(() => void run(hub.tick(now())), tickMs);
  const sweep = setInterval(() => {
    const limit = now().getTime() - silenceMs;
    for (const { ws, lastSeen } of sockets.values()) if (lastSeen < limit) ws.terminate();
  }, sweepMs);

  await new Promise<void>((resolve) => server.listen(options.port, options.hostname, resolve));
  const { port } = server.address() as AddressInfo;

  return {
    port,
    log,
    accounts,
    vault,
    stop: async () => {
      clearInterval(tick);
      clearInterval(sweep);
      for (const { ws } of sockets.values()) ws.terminate();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};
