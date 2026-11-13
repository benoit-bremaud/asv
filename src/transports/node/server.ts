/**
 * Node transport (`platform/02-sequence-node-transport`): the Hono app over `@hono/node-server`, and the
 * WebSocket upgrade with `ws` (owner choice D1). Owns sockets, heartbeat and the clock; the hub does the rest.
 */
import { createAdaptorServer } from "@hono/node-server";
import type { IncomingMessage } from "node:http";
import { isIP, type AddressInfo } from "node:net";
import { resolve } from "node:path";
import type { Duplex } from "node:stream";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { createAccountIo } from "../../server/account-io";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp, DEVICE_COOKIE, type LegalIdentity } from "../../server/app";
import { createCrypto } from "../../server/crypto/cipher";
import { cryptoKeysFromEnv, type CryptoEnv } from "../../server/crypto/keys";
import { createHub, type Outgoing } from "../../server/hub";
import { createBrevoMailer } from "../../server/mailer/brevo";
import { createFrameBudget, POLICY_CLOSE, type PolicyReason } from "../../server/frame-budget";
import { OFFICIAL_ROOMS } from "../../server/official-rooms";
import { createUpgradeLimiter, UPGRADE_LIMITS, type UpgradeVerdict } from "../../server/upgrade-limit";
import type { ConnectionLogStore, LegalVaultStore, Mailer } from "../../domain";
import { CAPS } from "../../shared/protocol";
import { createModerationIo } from "../../server/moderation-io";
import { moderatorTokenDigest } from "../../server/moderator-token";
import { createMemoryAccountStore, createMemoryVault } from "./memory-accounts";
import { createMemoryModerationStore } from "./memory-moderation";
import { createFileLog, createFileVault } from "./file-stores";
import { createMemoryLog } from "./memory-log";
import { createNodeRandom } from "./random";

/** Where the Node transport listens and how often it runs its timers. */
export interface NodeServerOptions {
  readonly port: number;
  readonly hostname: string;
  /** Exact `Origin` values allowed to open the WebSocket. */
  readonly allowedOrigins: readonly string[];
  /** `ASV_MODERATOR_TOKEN`: interim owner access, refused with `behindTunnel` (BR-091). */
  readonly moderatorToken?: string;
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
  /** JSONL connection log and legal vault (BR-084); memory when absent (development and tests). */
  readonly logFile?: string;
  readonly vaultFile?: string;
  /** Behind the Cloudflare Tunnel: client IP from `CF-Connecting-IP`; loopback listener required (BR-085). */
  readonly behindTunnel?: boolean;
  /** `Secure` device cookie and HSTS (BR-073, BR-086); default false (plain HTTP in development). */
  readonly secureCookie?: boolean;
  /** Folder of the production build to serve (`dist`); the Vite dev server serves it otherwise. */
  readonly staticRoot?: string;
  /** Owner identity for the legal pages (ADR-0018). */
  readonly legal?: LegalIdentity;
}

const DAY_MS = 24 * 60 * 60_000;
const LOOPBACK = new Set(["127.0.0.1", "::1"]);

/** BR-085: one valid address from `CF-Connecting-IP`, otherwise the socket address. */
export const clientAddress = (request: IncomingMessage, behindTunnel: boolean): { ip: string; port?: number } => {
  const header = request.headers["cf-connecting-ip"];
  const value = typeof header === "string" ? header.trim() : "";
  if (behindTunnel && isIP(value) !== 0) return { ip: value };
  return { ip: request.socket.remoteAddress ?? "", port: request.socket.remotePort };
};

/** BR-089 refusals, written on the raw socket before any WebSocket exists. */
const REFUSAL_STATUS: Record<Exclude<UpgradeVerdict, "ok">, string> = {
  perIp: "429 Too Many Requests",
  rate: "429 Too Many Requests",
  total: "503 Service Unavailable",
};

/**
 * Answers an upgrade with an HTTP status and destroys the socket once the answer is flushed: after
 * `upgrade` the socket has no parser timeout and the server allows half-open sockets, so `end` alone
 * would leave it open for a peer that never closes its side (like `abortHandshake` in `ws`).
 */
const refuseUpgrade = (socket: Duplex, status: string, headers = "") => {
  socket.once("finish", () => socket.destroy());
  socket.end(`HTTP/1.1 ${status}\r\n${headers}Content-Length: 0\r\nConnection: close\r\n\r\n`);
};

/** One open socket of the transport. */
interface SocketEntry {
  readonly ws: WebSocket;
  lastSeen: number;
  /** Set once the socket is being closed (BR-088, resume takeover). */
  refused: boolean;
}

/** A running Node transport: its bound port, its in-memory stores (tests read them; unused when files are set) and a graceful stop. */
export interface NodeServer {
  readonly port: number;
  readonly log: ReturnType<typeof createMemoryLog>;
  readonly accounts: ReturnType<typeof createMemoryAccountStore>;
  readonly vault: ReturnType<typeof createMemoryVault>;
  readonly moderation: ReturnType<typeof createMemoryModerationStore>;
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
  const behindTunnel = options.behindTunnel ?? false;
  if (behindTunnel && !LOOPBACK.has(options.hostname)) throw new Error("behindTunnel requires a loopback hostname (BR-085)");
  // Exposed testers need the legal files and a real mailer: no silent memory or dev-mail fallback (BR-084).
  if (behindTunnel && (options.logFile === undefined || options.vaultFile === undefined)) throw new Error("behindTunnel requires logFile and vaultFile (BR-084)");
  if (options.logFile !== undefined && options.vaultFile !== undefined && resolve(options.logFile) === resolve(options.vaultFile)) {
    throw new Error("logFile and vaultFile must be different files (BR-084)");
  }
  if (behindTunnel && options.mailer === undefined && !options.brevoApiKey) throw new Error("behindTunnel requires a Brevo API key");
  // Behind the tunnel real data is kept: every key is required, or the sealed vault could never be read (ADR-0017).
  const crypto = createCrypto(await cryptoKeysFromEnv(options.cryptoEnv ?? {}, behindTunnel, (text) => console.warn(text)));
  const log = createMemoryLog();
  const random = createNodeRandom();
  const accounts = createMemoryAccountStore();
  const vault = createMemoryVault();
  const moderation = createMemoryModerationStore();
  const moderatorToken = await moderatorTokenDigest(options.moderatorToken, behindTunnel);
  const fileLog = options.logFile === undefined ? undefined : createFileLog(options.logFile, now());
  const fileVault = options.vaultFile === undefined ? undefined : createFileVault(options.vaultFile, now());
  const purgeFiles = () => {
    try {
      fileLog?.purge(now());
      fileVault?.purge(now());
    } catch (error) {
      console.error("legal file purge failed", error);
    }
  };
  purgeFiles();
  const hubLog: ConnectionLogStore = fileLog ?? log;
  const hubVault: LegalVaultStore = fileVault ?? vault;
  const mailer = options.mailer ?? createBrevoMailer({
    apiKey: options.brevoApiKey,
    from: options.mailFrom ?? "contact@asvchat.fr",
    production: behindTunnel,
    log: (level, fields) => (level === "error" ? console.error : console.info)("mailer", fields),
  });
  const hub = createHub({
    officialRooms: OFFICIAL_ROOMS,
    random,
    hashToken: random.hashToken,
    log: hubLog,
    protocols: "HTTP/1.1 WebSocket",
    onLogError: (error) => console.error("connection log write failed", error),
    closeSocket: (key, reason) => refuse(key, reason),
    accounts: createAccountIo({ store: accounts, vault: hubVault, crypto }),
    mailer,
    onStoreError: (error) => console.error("account store failed", error),
    moderation: createModerationIo({ store: moderation, crypto }),
    moderatorTokenDigest: moderatorToken,
  });
  const app = createApp({
    stats: hub.stats,
    accounts: {
      allowedOrigins: options.allowedOrigins,
      // Plain HTTP on 127.0.0.1 in development; on behind the tunnel (BR-073, BR-086).
      secureCookie: options.secureCookie ?? false,
      redeemDeviceClaim: (claim) => hub.redeemDeviceClaim(claim, now()),
      signOutDevice: async (token) => deliver(await hub.signOutDevice(random.hashToken(token))),
    },
    legal: options.legal,
  });
  if (options.staticRoot !== undefined) app.use("*", serveStatic({ root: options.staticRoot }));
  const server = createAdaptorServer({ fetch: app.fetch, hostname: options.hostname });
  const wss = new WebSocketServer({ noServer: true, maxPayload: CAPS.frame });
  const sockets = new Map<string, SocketEntry>();
  const limiter = createUpgradeLimiter();
  /**
   * Closes a socket with 1008 (BR-088), or with no code for a resume takeover; a closing socket's frames
   * are ignored and no longer refresh `lastSeen`, so the silence sweep ends a peer that never answers.
   */
  const refuse = (key: string, reason?: PolicyReason) => {
    const entry = sockets.get(key);
    if (!entry) return;
    entry.refused = true;
    // Next turn: the hub asks from inside a task whose answer (the fifth `error invalid`) is sent first.
    setImmediate(() => (reason ? entry.ws.close(POLICY_CLOSE, reason) : entry.ws.close()));
  };
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
    const entry: SocketEntry = { ws, lastSeen: now().getTime(), refused: false };
    const budget = createFrameBudget(entry.lastSeen);
    sockets.set(key, entry);
    // Set on an open socket; empty only if it died before this line.
    const device = deviceCookie(request.headers.cookie);
    const { ip, port } = clientAddress(request, behindTunnel);
    hub.open(key, ip, port, device && random.hashToken(device));
    ws.on("message", (data, isBinary) => {
      // A closing socket may still emit frames until the peer answers; they reach nothing (BR-088).
      if (entry.refused) return;
      const nowMs = now().getTime();
      // BR-088: before any parsing, so a flood never reaches the hub queue.
      if (!budget.take(nowMs)) return refuse(key, "tooManyFrames");
      entry.lastSeen = nowMs;
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
      refuseUpgrade(socket, "403 Forbidden");
      return;
    }
    const { ip } = clientAddress(request, behindTunnel);
    const verdict = limiter.admit(ip, now().getTime());
    if (verdict !== "ok") {
      refuseUpgrade(socket, REFUSAL_STATUS[verdict], `Retry-After: ${UPGRADE_LIMITS.retryAfterSeconds}\r\n`);
      return;
    }
    // The raw socket closes whatever happens next (handshake refused by `ws`, or the WebSocket closing).
    socket.once("close", () => limiter.release(ip));
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  });

  const tick = setInterval(() => {
    void run(hub.tick(now()));
    limiter.prune(now().getTime());
  }, tickMs);
  const daily = setInterval(purgeFiles, DAY_MS);
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
    moderation,
    stop: async () => {
      clearInterval(tick);
      clearInterval(sweep);
      clearInterval(daily);
      for (const { ws } of sockets.values()) ws.terminate();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};
