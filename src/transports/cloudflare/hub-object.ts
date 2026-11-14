/**
 * The Hub Durable Object (ADR-0020 §2 to §4, `platform/09`): one object in the EU jurisdiction, without
 * hibernation. Its constructor, inside `blockConcurrencyWhile`, migrates the schema, closes the connection
 * lines a previous run left open (BR-109) and builds the transport-neutral hub and the Hono app; then it
 * accepts sockets with `server.accept()`, runs the tick and heartbeat timers while a socket is open and one alarm
 * for purges and mail retries (BR-110). It mirrors the Node transport (`platform/02`).
 */
import type { Hono } from "hono";
import type { ConnectionLogStore, Mailer, ReportTriage } from "../../domain";
import { createAccountIo } from "../../server/account-io";
import { createApp, deviceCookieOf } from "../../server/app";
import { createCrypto } from "../../server/crypto/cipher";
import { fromBase64 } from "../../server/crypto/keys";
import { createFrameBudget, POLICY_CLOSE, type PolicyReason } from "../../server/frame-budget";
import { createHub, type Hub, type Outgoing } from "../../server/hub";
import { createModeratorOps, type ModeratorOps } from "../../server/hub-moderators";
import { createBrevoMailer } from "../../server/mailer/brevo";
import { STATEMENT_RETRY_MS } from "../../server/moderation-mail";
import { createModerationIo } from "../../server/moderation-io";
import { createGrantKey } from "../../server/moderator-grant";
import { createModeratorIo } from "../../server/moderator-io";
import { addModeratorRoutes } from "../../server/moderator-routes";
import { OFFICIAL_ROOMS } from "../../server/official-rooms";
import { createMistralTriage } from "../../server/triage/mistral";
import { noAiTriage } from "../../server/triage/no-ai";
import { createUpgradeLimiter, UPGRADE_LIMITS, type UpgradeLimiter, type UpgradeVerdict } from "../../server/upgrade-limit";
import { nextAlarmAt, PURGE_EVERY_MS, purgeDue } from "./alarm";
import { checkConfig, type Config, type Env } from "./env";
import { createCloudflareRandom } from "./random";
import { type SqlStorage } from "./sql";
import {
  closeOpenLines,
  createSqlAccountClosing,
  createSqlAccountStore,
  createSqlLog,
  createSqlModerationStore,
  createSqlModeratorStore,
  createSqlVault,
  hasPendingMail,
  migrate,
  readMeta,
  writeMeta,
} from "./sqlite-stores";

/** The server end of a WebSocket pair, as the hub object uses it. */
export interface ServerSocket {
  accept(): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close" | "error", listener: () => void): void;
}

/** `ctx` of the Durable Object, reduced to what the hub object calls. */
export interface HubObjectState {
  readonly storage: SqlStorage & {
    setAlarm(scheduledTime: number): Promise<void>;
    getAlarm(): Promise<number | null>;
  };
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

/** What tests replace: the clock, timers, the socket pair, the mailer and the triage fetch. */
export interface HubObjectOptions {
  readonly now?: () => Date;
  readonly tickMs?: number;
  readonly sweepMs?: number;
  readonly silenceMs?: number;
  /** A new `WebSocketPair`, and the 101 answer carrying its client end. */
  readonly upgrade?: () => { readonly server: ServerSocket; readonly response: Response };
  readonly mailer?: Mailer;
  readonly triageFetch?: typeof fetch;
  readonly setInterval?: (callback: () => void, ms: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
}

/** BR-110: sweep every 15 seconds, silence limit 60 seconds (ADR-0011 point 3). */
export const SWEEP_MS = 15_000;
export const SILENCE_MS = 60_000;
/** BR-089 refusals before any socket exists. */
const REFUSAL_STATUS: Record<Exclude<UpgradeVerdict, "ok">, number> = { perIp: 429, rate: 429, total: 503 };
const LAST_PURGE = "lastPurgeAt";

interface SocketEntry {
  readonly socket: ServerSocket;
  lastSeen: number;
  refused: boolean;
  /** Runs the hub's close once, whether the runtime reports the close or the transport ends the socket. */
  readonly closed: () => void;
}

/** Closes a socket the peer may have closed already; the hub's close must run whatever happens. */
const closeQuietly = (socket: ServerSocket, reason?: PolicyReason): void => {
  try {
    if (reason) socket.close(POLICY_CLOSE, reason);
    else socket.close();
  } catch {
    // Already closed.
  }
};

/** The runtime's `WebSocketPair`, absent from the DOM types. */
declare const WebSocketPair: new () => Record<0 | 1, unknown>;

/* v8 ignore start -- runtime-only: `WebSocketPair` and the 101 answer exist on Workers only. */
const runtimeUpgrade = (): { server: ServerSocket; response: Response } => {
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1] as ServerSocket;
  return { server, response: new Response(null, { status: 101, webSocket: client } as ResponseInit) };
};
/* v8 ignore stop */

/** ADR-0019, BR-108: Mistral only with a key, the no-AI adapter otherwise. */
const triageOf = (env: Env, fetcher?: typeof fetch): ReportTriage =>
  env.ASV_MISTRAL_API_KEY
    ? createMistralTriage({ apiKey: env.ASV_MISTRAL_API_KEY, model: env.ASV_TRIAGE_MODEL || undefined, fetch: fetcher, log: (fields) => console.error("triage", fields) })
    : noAiTriage;

/** A running hub inside the object. */
interface Running {
  readonly hub: Hub;
  readonly app: Hono;
  readonly log: ReturnType<typeof createSqlLog>;
  readonly moderators: ModeratorOps;
  readonly hashToken: (value: string) => string;
}

/** The Hub Durable Object; the Worker exports it as `HubObject` (`wrangler.jsonc`). */
export class HubObject {
  private readonly now: () => Date;
  private readonly sockets = new Map<string, SocketEntry>();
  private readonly limiter: UpgradeLimiter = createUpgradeLimiter();
  private running: Running | undefined;
  private scheduledAlarm: number | undefined;
  /** The tick and sweep timers, set only while a socket is open (`platform/05`). */
  private timers: unknown[] = [];
  private nextKey = 0;

  constructor(
    private readonly ctx: HubObjectState,
    private readonly env: Env,
    private readonly options: HubObjectOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    void ctx.blockConcurrencyWhile(() => this.start());
  }

  /** Migrates, closes orphan lines, builds the hub and arms the alarm (BR-109, BR-110). */
  private async start(): Promise<void> {
    const config = await checkConfig(this.env);
    if ("problem" in config) {
      // The Worker refuses first (BR-111); the object stays idle and answers 503.
      console.error("hub not started (BR-111)", config.problem);
      return;
    }
    const storage = this.ctx.storage;
    migrate(storage);
    closeOpenLines(storage, this.now());
    this.running = await this.build(config);
    await this.armAlarm(this.nextAlarm());
  }

  /** The 1-second tick and the 15-second sweep run while sockets exist, so an idle object can be evicted. */
  private startTimers(): void {
    if (this.timers.length > 0) return;
    const every = this.options.setInterval ?? ((callback: () => void, ms: number) => setInterval(callback, ms));
    this.timers = [
      every(() => void this.tick(), this.options.tickMs ?? 1000),
      every(() => this.sweep(), this.options.sweepMs ?? SWEEP_MS),
    ];
    // One tick at once: away sessions that expired while no socket was open leave before the first count.
    void this.tick();
  }

  private stopTimers(): void {
    const clear = this.options.clearInterval ?? ((handle: unknown) => clearInterval(handle as ReturnType<typeof setInterval>));
    for (const handle of this.timers) clear(handle);
    this.timers = [];
  }

  private async build(config: Config): Promise<Running> {
    const storage = this.ctx.storage;
    const crypto = createCrypto(config.keys);
    const random = createCloudflareRandom(fromBase64(this.env.ASV_HMAC_KEY ?? ""));
    const log = createSqlLog(storage, crypto);
    const moderationStore = createSqlModerationStore(storage, () => {
      this.armAlarm(this.now().getTime() + STATEMENT_RETRY_MS).catch((error: unknown) => console.error("alarm not armed", error));
    });
    const moderationIo = createModerationIo({ store: moderationStore, crypto });
    const moderators = createModeratorOps(createModeratorIo({ store: createSqlModeratorStore(storage), crypto }));
    const grantKey = await createGrantKey();
    const mailer = this.options.mailer ?? createBrevoMailer({
      apiKey: config.brevoApiKey,
      from: this.env.ASV_MAIL_FROM ?? "contact@asvchat.fr",
      contactEmail: this.env.ASV_CONTACT_EMAIL,
      production: true,
      log: (level, fields) => (level === "error" ? console.error : console.info)("mailer", fields),
    });
    const hubLog: ConnectionLogStore = log;
    const hub = createHub({
      officialRooms: OFFICIAL_ROOMS,
      random,
      hashToken: random.hashToken,
      log: hubLog,
      protocols: "HTTP/1.1 WebSocket",
      onLogError: (error) => console.error("connection log write failed", error),
      closeSocket: (key, reason) => this.refuse(key, reason),
      accounts: createAccountIo({
        store: createSqlAccountStore(storage),
        vault: createSqlVault(storage),
        closing: createSqlAccountClosing(storage),
        crypto,
      }),
      mailer,
      onStoreError: (error) => console.error("store failed", error),
      moderation: moderationIo,
      triage: triageOf(this.env, this.options.triageFetch),
      grantKey,
      canReport: config.moderation,
      maintenanceInTick: false,
    });
    const app = createApp({
      stats: hub.stats,
      accounts: {
        allowedOrigins: config.allowedOrigins,
        secureCookie: true,
        redeemDeviceClaim: (claim) => hub.redeemDeviceClaim(claim, this.now()),
        signOutDevice: async (token) => this.deliver(await hub.signOutDevice(random.hashToken(token))),
      },
      legal: {
        ownerName: this.env.ASV_OWNER_NAME,
        postalAddress: this.env.ASV_OWNER_ADDRESS,
        phone: this.env.ASV_OWNER_PHONE,
        contactEmail: this.env.ASV_CONTACT_EMAIL,
        brevoLocation: this.env.ASV_BREVO_LOCATION,
      },
    });
    // BR-097, BR-108: `/mod/*` answers 404 while moderation is off; the owner routes stay (BR-093).
    if (!config.moderation) app.all("/mod/*", (c) => c.body(null, 404, { "Cache-Control": "no-store" }));
    addModeratorRoutes(app, {
      ops: moderators,
      grantKey,
      publicOrigin: config.publicOrigin,
      allowedOrigins: config.allowedOrigins,
      ownerSecret: config.ownerSecret,
      behindTunnel: false,
      ownerLoopbackOnly: false,
      recordFiling: (reportId, channel, reference, at) => moderationIo.recordFiling(reportId, channel, reference, at),
      peerAddress: (c) => c.req.header("cf-connecting-ip"),
      now: this.now,
      onError: (error) => console.error("moderator route failed", error),
    });
    return { hub, app, log, moderators, hashToken: random.hashToken };
  }

  /** The Worker forwards every non-asset request here, upgrades included. */
  async fetch(request: Request): Promise<Response> {
    if (!this.running) return new Response(null, { status: 503, headers: { "Retry-After": "60" } });
    if (new URL(request.url).pathname === "/ws" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return this.upgrade(request, this.running);
    }
    return this.running.app.fetch(request);
  }

  /** BR-089 on the quota key (BR-112), then `server.accept()` (no hibernation, BR-109). */
  private upgrade(request: Request, { hub, hashToken }: Running): Response {
    // The Worker checked it is one valid address (BR-111).
    const ip = request.headers.get("cf-connecting-ip") ?? "";
    const verdict = this.limiter.admit(ip, this.now().getTime());
    if (verdict !== "ok") {
      return new Response(null, { status: REFUSAL_STATUS[verdict], headers: { "Retry-After": String(UPGRADE_LIMITS.retryAfterSeconds) } });
    }
    const { server, response } = (this.options.upgrade ?? runtimeUpgrade)();
    server.accept();
    const key = String(this.nextKey++);
    let closed = false;
    const onClose = () => {
      if (closed) return;
      closed = true;
      this.sockets.delete(key);
      if (this.sockets.size === 0) this.stopTimers();
      this.limiter.release(ip);
      void this.run(hub.close(key, this.now()));
    };
    const entry: SocketEntry = { socket: server, lastSeen: this.now().getTime(), refused: false, closed: onClose };
    const budget = createFrameBudget(entry.lastSeen);
    this.sockets.set(key, entry);
    this.startTimers();
    const device = deviceCookieOf(request.headers.get("cookie"));
    hub.open(key, ip, undefined, device && hashToken(device));
    server.addEventListener("message", (event) => {
      if (entry.refused) return;
      const nowMs = this.now().getTime();
      // BR-088: before any parsing, so a flood never reaches the hub queue.
      if (!budget.take(nowMs)) return this.refuse(key, "tooManyFrames");
      entry.lastSeen = nowMs;
      // Binary frames are not part of the protocol: the hub refuses them as invalid.
      const text = typeof event.data === "string" ? event.data : "";
      // Heartbeat answered by the transport: no auto-response with `server.accept()` (BR-088, BR-110).
      if (text === "ping") return server.send("pong");
      // An oversize frame counts as invalid in the hub, closed at the fifth in a row (BR-088).
      void this.run(hub.receive(key, text, this.now()));
    });
    server.addEventListener("close", onClose);
    server.addEventListener("error", onClose);
    return response;
  }

  /** Closes a socket with 1008 (BR-088), or with no code for a resume takeover, on the next turn. */
  private refuse(key: string, reason?: PolicyReason): void {
    const entry = this.sockets.get(key);
    if (!entry) return;
    entry.refused = true;
    // Next turn: the hub asks from inside a task whose answer is sent first. A dead peer never answers the
    // close, so the hub's close runs at once.
    setTimeout(() => {
      closeQuietly(entry.socket, reason);
      entry.closed();
    }, 0);
  }

  private deliver(out: readonly Outgoing[]): void {
    for (const { to, message } of out) {
      const text = JSON.stringify(message);
      for (const key of to) this.sockets.get(key)?.socket.send(text);
    }
  }

  private run(task: Promise<Outgoing[]>): Promise<void> {
    return task.then((out) => this.deliver(out), (error: unknown) => console.error("hub operation failed", error));
  }

  /** The 1-second tick: away expiry and pruning, no store purge (BR-110). */
  tick(): Promise<void> {
    this.limiter.prune(this.now().getTime());
    return this.running ? this.run(this.running.hub.tick(this.now())) : Promise.resolve();
  }

  /** Every 15 seconds: closes a socket silent for 60 seconds (BR-110); its close follows the usual path. */
  sweep(): void {
    const limit = this.now().getTime() - (this.options.silenceMs ?? SILENCE_MS);
    for (const entry of this.sockets.values()) {
      if (entry.lastSeen >= limit) continue;
      // Node terminates the socket; here a close with no code, then the hub's close at once.
      closeQuietly(entry.socket);
      entry.closed();
    }
  }

  /** The one alarm (BR-110): daily purge when due, a mail retry round, then the next alarm. */
  async alarm(): Promise<void> {
    this.scheduledAlarm = undefined;
    const running = this.running;
    if (!running) return;
    const now = this.now();
    const storage = this.ctx.storage;
    const purge = purgeDue(now.getTime(), this.lastPurge());
    let failed = false;
    if (purge) {
      try {
        await running.log.purge(now);
        await running.moderators.purge(now);
      } catch (error) {
        failed = true;
        console.error("daily purge failed", error);
      }
    }
    // Accounts, vault and moderation purges on the daily run only, then one retry round.
    const purged = await running.hub.maintain(now, purge);
    if (!purged) failed = true;
    // `lastPurgeAt` moves only when every purge succeeded (BR-110).
    if (purge && !failed) writeMeta(storage, LAST_PURGE, String(now.getTime()));
    // A failed purge is retried with the mail round, not every second.
    const next = this.nextAlarm();
    await this.armAlarm(failed ? Math.max(next, now.getTime() + STATEMENT_RETRY_MS) : next);
  }

  private lastPurge(): number | undefined {
    const value = readMeta(this.ctx.storage, LAST_PURGE);
    return value === undefined ? undefined : Number(value);
  }

  private nextAlarm(): number {
    const nowMs = this.now().getTime();
    return nextAlarmAt(nowMs, this.lastPurge() ?? nowMs - PURGE_EVERY_MS, hasPendingMail(this.ctx.storage, this.now()));
  }

  /** Arms the alarm at `at` unless one is already set earlier. */
  private async armAlarm(at: number): Promise<void> {
    if (this.scheduledAlarm !== undefined && this.scheduledAlarm <= at) return;
    this.scheduledAlarm = at;
    await this.ctx.storage.setAlarm(at);
  }
}

