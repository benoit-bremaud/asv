/**
 * Transport-neutral hub (`platform/04c`): holds the live state, validates incoming messages, calls the
 * pure domain, writes the connection log and maps domain effects to protocol messages. Transports own the
 * sockets and send what it returns (`platform/02`).
 */
import {
  createRoom,
  emptyHubState,
  enter,
  expireAway,
  joinRoom,
  leave,
  leaveRoom,
  postRoom,
  pruneDeviceClaims,
  pruneEntryAttempts,
  pruneFlood,
  pruneReportAttempts,
  redeemDeviceClaim,
  resume,
  roomList,
  socketLost,
  type CodeRandom,
  type ConnectionLogStore,
  type HubState,
  type Mailer,
  type ReportTriage,
  type OfficialRoom,
  type RoomsResult,
} from "../domain";
import type { AccountIo } from "./account-io";
import { createAccountHandlers, type Caller } from "./hub-accounts";
import { createModerationHandlers, type ModerationCaller } from "./hub-moderation";
import { createPrivateHandlers, type PrivateCaller } from "./hub-private";
import type { ModerationIo } from "./moderation-io";
import { readGrant, type GrantClaims } from "./moderator-grant";
import { createOutgoing, sessionOf, type Outgoing } from "./outgoing";
import { FRAME_LIMITS, type PolicyReason } from "./frame-budget";
import { UPGRADE_LIMITS } from "./upgrade-limit";
import { quotaKey } from "../domain";
import { CAPS, clientMessage, type ClientMessage } from "../shared/protocol";

export type { Outgoing } from "./outgoing";

/** What a transport plugs into the hub. */
export interface HubDeps {
  readonly officialRooms: readonly OfficialRoom[];
  readonly random: CodeRandom;
  /** Same keyed hash as `random.token()` (`entry/07`). */
  readonly hashToken: (value: string) => string;
  readonly log: ConnectionLogStore;
  /** Protocols of the connection line, for example `HTTP/1.1 WebSocket` (BR-060). */
  readonly protocols: string;
  /** Called on every failed log write; a failed open or contribution also refuses the command. */
  readonly onLogError: (error: unknown) => void;
  /**
   * Asks the transport to close a socket whose session a resume took over, or, given a reason, one that
   * broke BR-088 (the transport closes it with 1008); its `close` then follows.
   */
  readonly closeSocket: (socketKey: string, reason?: PolicyReason) => void;
  /** Account and vault stores behind the crypto of ADR-0017 (`platform/04d`). */
  readonly accounts: AccountIo;
  readonly mailer: Mailer;
  /** Called on every failed account store write or purge; the command then gets `warning unavailable`. */
  readonly onStoreError: (error: unknown) => void;
  /** Reports and bans behind the crypto of ADR-0017 (`moderation/04`). */
  readonly moderation: ModerationIo;
  /** AI triage of reports (ADR-0019, BR-101); the no-AI adapter when absent. */
  readonly triage?: ReportTriage;
  /** Key of the passkey grants, drawn at start (BR-095); absent, no session can be a moderator. */
  readonly grantKey?: CryptoKey;
  /** False behind the tester tunnel: `report` answers `notAvailable` until brick 8c (`moderation/01`). */
  readonly canReport?: boolean;
  /**
   * True (default, Node): every `tick` purges the stores and starts a mail retry round. False (Cloudflare,
   * BR-110): the transport calls `maintain` from its alarm instead.
   */
  readonly maintenanceInTick?: boolean;
}

/** BR-096: at most 5 refused moderator grants per IP within 10 minutes, then `entryRefused(rate)`. */
export const GRANT_FAILURES_MAX = 5;
export const GRANT_WINDOW_MS = 10 * 60_000;

/** A device token set by `POST /account/device` (BR-073). */
export interface DeviceToken {
  readonly token: string;
  readonly expiresAt: Date;
}

/** `GET /api/stats` (`platform/04`): an aggregate only. */
export interface Stats {
  readonly connected: number;
}

/**
 * What a transport calls. `receive`, `close` and `tick` run one after the other; the transport sends each
 * `Outgoing` as is. Bad client input never throws: it becomes an `error` message. Unknown keys yield `[]`.
 */
export interface Hub {
  /** `deviceTokenHash`: the device cookie hashed like `Random.token`, if the upgrade carried one. */
  open(socketKey: string, ip: string, port?: number, deviceTokenHash?: string): void;
  receive(socketKey: string, raw: string, now: Date): Promise<Outgoing[]>;
  close(socketKey: string, now: Date): Promise<Outgoing[]>;
  tick(now: Date): Promise<Outgoing[]>;
  /**
   * Store purges when `purge`, then one mail retry round, awaited (BR-110); errors go to `onStoreError`.
   * Resolves `false` when a requested purge failed, so the alarm retries it.
   */
  maintain(now: Date, purge: boolean): Promise<boolean>;
  /** `POST /account/device`: exchanges a device claim for a token, or `undefined` (BR-073). */
  redeemDeviceClaim(claim: string, now: Date): Promise<DeviceToken | undefined>;
  /** `POST /account/sign-out`: forgets this device and unlinks its sessions (UC18). */
  signOutDevice(tokenHash: string): Promise<Outgoing[]>;
  stats(): Stats;
}

interface Socket {
  readonly key: string;
  readonly ip: string;
  readonly port?: number;
  readonly deviceTokenHash?: string;
  /** Set once the socket holds a session, with the id of its connection line (BR-060). */
  bound?: { readonly sessionId: string; readonly connectionId: string };
  /** Invalid frames in a row (BR-088). */
  invalid: number;
  /** Epoch ms of the first tick that saw the socket without a session; cleared while bound (BR-089). */
  unboundSince?: number;
  /** Set once `tick` asked the transport to close it as unbound, so it asks once. */
  unboundClosed?: true;
}

type Command<T extends ClientMessage["type"]> = Extract<ClientMessage, { type: T }>;
type Bound = NonNullable<Socket["bound"]>;
/** Commands that need a session; `enter` and `resume` need a socket without one. */
type BoundType = Exclude<ClientMessage["type"], "enter" | "resume">;
type BoundHandler<K extends BoundType> = (socket: Socket, bound: Bound, command: Command<K>, now: Date) => Promise<Outgoing[]>;
/** One entry per command, so the type checker refuses a missing one (issue #25). */
type HandlerMap = { readonly [K in BoundType]: BoundHandler<K> };

/** Reads `seq` from a message that failed validation, to link the error to it. */
const seqOf = (data: unknown): number | undefined => {
  if (typeof data !== "object" || data === null || !("seq" in data)) return undefined;
  const { seq } = data;
  return Number.isInteger(seq) && typeof seq === "number" && seq >= 0 ? seq : undefined;
};

const parseJson = (raw: string): { ok: true; data: unknown } | { ok: false } => {
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
};

/** Builds the hub for one transport. */
export const createHub = (deps: HubDeps): Hub => {
  let state: HubState = emptyHubState(deps.officialRooms);
  const sockets = new Map<string, Socket>();
  const socketOfSession = new Map<string, string>();
  // Log writes are awaited: every operation runs after the previous one, so none sees a stale state.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  };

  const out = createOutgoing({
    state: () => state,
    socketOf: (sessionId) => socketOfSession.get(sessionId),
    allSockets: () => [...socketOfSession.values()],
  });
  const { send } = out;
  /** A reloaded client starts with no ignore list; the server kept it (BR-042). */
  const ignoresOf = (key: string, ignored: readonly string[] | undefined): Outgoing[] =>
    ignored && ignored.length > 0 ? [send([key], "ignoreUpdated", { ignored: [...ignored] })] : [];
  const setState = (next: HubState): void => {
    state = next;
  };
  const accounts = createAccountHandlers({ deps, out, state: () => state, setState });
  const privates = createPrivateHandlers({ deps, out, state: () => state, setState });

  const closeLine = async (connectionId: string, now: Date): Promise<void> => {
    try {
      await deps.log.close(connectionId, now);
    } catch (cause) {
      deps.onLogError(cause);
    }
  };

  /** Opens the connection line, then binds the session to the socket (`entry/02a`, `entry/02b`). */
  const bind = async (socket: Socket, sessionId: string, next: HubState, now: Date): Promise<boolean> => {
    const session = sessionOf(next, sessionId);
    const connectionId = deps.random.id();
    try {
      await deps.log.open({
        connectionId,
        ip: socket.ip,
        port: socket.port,
        protocols: deps.protocols,
        pseudo: session.pseudo,
        accountId: session.accountId,
        openedAt: now,
      });
    } catch (cause) {
      deps.onLogError(cause);
      return false;
    }
    state = next;
    socket.bound = { sessionId, connectionId };
    socketOfSession.set(sessionId, socket.key);
    return true;
  };

  /** The account behind the socket's device cookie (`entry/02a`); a cookie of a deleted account is stale. */
  const deviceAccount = async (socket: Socket, now: Date): Promise<{ accountId?: string; stale: boolean } | "unavailable"> => {
    if (!socket.deviceTokenHash) return { stale: false };
    try {
      const account = await deps.accounts.accountForDevice(socket.deviceTokenHash, now);
      return account ? { accountId: account.id, stale: false } : { stale: true };
    } catch (cause) {
      deps.onStoreError(cause);
      return "unavailable";
    }
  };

  /** UC13: an away session linked to an account resumes linked only if the account still exists. */
  const linkedAccountExists = async (resumeTokenHash: string): Promise<boolean> => {
    const away = [...state.sessions.values()].find(
      (candidate) => candidate.status === "away" && candidate.resumeTokenHash === resumeTokenHash,
    );
    return away?.accountId === undefined || deps.accounts.accountExists(away.accountId);
  };

  /** BR-096: refused grants per IP within the last `GRANT_WINDOW_MS`, so the token cannot be guessed. */
  const canReport = deps.canReport ?? true;
  const grantFailures = new Map<string, number[]>();
  const recentGrantFailures = (ip: string, nowMs: number): number[] =>
    (grantFailures.get(ip) ?? []).filter((at) => nowMs - at < GRANT_WINDOW_MS);

  /** BR-095: nonces of grants already used, kept until the grant expires. */
  const usedNonces = new Map<string, number>();
  const checkGrant = async (grant: string, now: Date) => {
    const nowMs = now.getTime();
    for (const [nonce, expiresAt] of usedNonces) if (expiresAt <= nowMs) usedNonces.delete(nonce);
    const claims = deps.grantKey && (await readGrant(deps.grantKey, grant, now));
    return claims && !usedNonces.has(claims.nonce) ? claims : undefined;
  };

  /** BR-095, BR-096: the checked grant, `undefined` without one, or the refusal to send. */
  type Admission = { readonly grant?: GrantClaims } | { readonly refused: Outgoing[] };
  const admitGrant = async (socket: Socket, moderatorGrant: string | undefined, now: Date): Promise<Admission> => {
    if (moderatorGrant === undefined) return {};
    const failures = recentGrantFailures(quotaKey(socket.ip), now.getTime());
    if (failures.length >= GRANT_FAILURES_MAX) return { refused: [send([socket.key], "entryRefused", { reason: "rate" })] };
    // BR-095: a refused grant creates no session, so a bad grant cannot enter as a chatter.
    const grant = await checkGrant(moderatorGrant, now);
    if (grant) return { grant };
    grantFailures.set(quotaKey(socket.ip), [...failures, now.getTime()]);
    return { refused: [send([socket.key], "entryRefused", { reason: "notModerator" })] };
  };

  const onEnter = async (socket: Socket, command: Command<"enter">, now: Date): Promise<Outgoing[]> => {
    const { payload } = command;
    const admitted = await admitGrant(socket, payload.moderatorGrant, now);
    if ("refused" in admitted) return admitted.refused;
    const { grant } = admitted;
    const isModerator = grant !== undefined;
    const device = await deviceAccount(socket, now);
    if (device === "unavailable") return [out.warning(socket.key, "unavailable", command.seq)];
    let activeBan: { until: Date } | undefined;
    try {
      activeBan = await deps.moderation.activeBan(socket.ip, payload.pseudo, now);
    } catch (cause) {
      deps.onStoreError(cause);
      return [out.warning(socket.key, "unavailable", command.seq)];
    }
    const result = enter(state, {
      pseudo: payload.pseudo,
      gender: payload.gender,
      age: payload.age,
      city: payload.city,
      adultConfirmed: payload.adultConfirmed,
      termsAccepted: payload.termsAccepted,
      ip: socket.ip,
      accountId: device.accountId,
      deviceTokenHash: socket.deviceTokenHash,
      activeBan,
      isModerator,
      moderatorName: grant?.name,
    }, now, deps.random);
    const [effect] = result.effects;
    if (effect?.type === "entered") {
      if (!(await bind(socket, effect.sessionId, result.state, now))) {
        return [out.error(socket.key, "logUnavailable", command.seq)];
      }
      // BR-095: the nonce is spent only once the entry succeeded.
      if (grant) usedNonces.set(grant.nonce, grant.expiresAt);
      return [send([socket.key], "entered", {
        sessionId: effect.sessionId,
        resumeToken: effect.resumeToken,
        roomList: roomList(state),
        isModerator,
        ...(grant ? { moderatorName: grant.name } : {}),
        canReport,
        ...(effect.accountId ? { accountId: effect.accountId } : {}),
        ...(device.stale ? { staleDevice: true } : {}),
      })];
    }
    state = result.state;
    if (effect?.type === "entryRefused") {
      return [send([socket.key], "entryRefused", { reason: effect.reason, bannedUntil: effect.bannedUntil?.toISOString() })];
    }
    return [out.error(socket.key, "invalid", command.seq)];
  };

  /**
   * The token's session is still bound to an older socket the transport has not swept yet (network change):
   * that socket loses it as if it had closed, so the resume can take over (`entry/02b`). Returns the released
   * session id; `memberAway` is held back until the resume fails.
   */
  const releaseStale = async (resumeTokenHash: string, now: Date): Promise<string | undefined> => {
    const session = [...state.sessions.values()].find(
      (candidate) => candidate.status === "connected" && candidate.resumeTokenHash === resumeTokenHash,
    );
    const key = session && socketOfSession.get(session.id);
    const stale = key === undefined ? undefined : sockets.get(key);
    if (!session || !stale?.bound) return undefined;
    const { connectionId } = stale.bound;
    stale.bound = undefined;
    socketOfSession.delete(session.id);
    state = socketLost(state, session.id, now).state;
    await closeLine(connectionId, now);
    // The displaced page still pings, so the silence sweep would never close it.
    deps.closeSocket(stale.key);
    return session.id;
  };

  const onResume = async (socket: Socket, command: Command<"resume">, now: Date): Promise<Outgoing[]> => {
    const { profile, resumeToken } = command.payload;
    const resumeTokenHash = deps.hashToken(resumeToken);
    const released = await releaseStale(resumeTokenHash, now);
    // The takeover could not finish: the others must see the session away.
    const awayIfReleased = () => {
      if (!released) return [];
      const session = sessionOf(state, released);
      return [...out.memberAwayInRooms(session), ...privates.wentAway(session)];
    };
    let accountStillExists: boolean;
    try {
      accountStillExists = await linkedAccountExists(resumeTokenHash);
    } catch (cause) {
      deps.onStoreError(cause);
      return [out.warning(socket.key, "unavailable", command.seq), ...awayIfReleased()];
    }
    const result = resume(state, {
      resumeTokenHash,
      ip: socket.ip,
      gender: profile.gender,
      age: profile.age,
      city: profile.city,
      accountStillExists,
    }, now, deps.random);
    const [effect] = result.effects;
    if (effect?.type === "resumed") {
      if (!(await bind(socket, effect.sessionId, result.state, now))) {
        return [out.error(socket.key, "logUnavailable", command.seq), ...awayIfReleased()];
      }
      const session = sessionOf(state, effect.sessionId);
      const windows = privates.resumedWindows(session, effect.buffered);
      return [
        send([socket.key], "resumed", {
          sessionId: session.id,
          pseudo: session.pseudo,
          resumeToken: effect.resumeToken,
          rooms: session.rooms.map(out.roomJoined),
          windows: windows.windows,
          buffered: windows.buffered,
          ...(session.accountId ? { accountId: session.accountId } : {}),
          ...(session.isModerator ? { isModerator: true } : {}),
          ...(session.moderatorName !== undefined ? { moderatorName: session.moderatorName } : {}),
          canReport,
        }),
        send([socket.key], "roomList", { rooms: roomList(state) }),
        ...ignoresOf(socket.key, state.ignores.get(session.id)),
        ...out.memberBackInRooms(session),
        ...windows.back,
      ];
    }
    if (effect?.type === "resumeRefused") return [send([socket.key], "resumeRefused", {})];
    return [out.error(socket.key, "invalid", command.seq), ...awayIfReleased()];
  };

  const onLeave = async (socket: Socket, bound: Bound, now: Date): Promise<Outgoing[]> => {
    const result = leave(state, bound.sessionId);
    state = result.state;
    socketOfSession.delete(bound.sessionId);
    socket.bound = undefined;
    // BR-089: the unbound time starts again, even if no tick saw the socket bound.
    socket.unboundSince = undefined;
    await closeLine(bound.connectionId, now);
    return out.roomOutgoing(result.effects);
  };

  /** Sockets an expel closes once the whole command has answered, so `expelled` leaves first (UC11). */
  let closeAfter: string[] = [];
  /** UC11: the target learns the end of its ban, its socket closes, and its rooms see it leave. */
  const evict = async (sessionId: string, until: Date, now: Date): Promise<Outgoing[]> => {
    const key = socketOfSession.get(sessionId);
    const socket = key === undefined ? undefined : sockets.get(key);
    const told = key === undefined ? [] : [send([key], "expelled", { until: until.toISOString() })];
    if (socket?.bound) {
      await onLeave(socket, socket.bound, now).then((left) => told.push(...left));
      closeAfter.push(socket.key);
      return told;
    }
    const result = leave(state, sessionId);
    state = result.state;
    return [...told, ...out.roomOutgoing(result.effects)];
  };
  const moderation = createModerationHandlers({ deps, out, state: () => state, setState, evict });
  /** Store purges (BR-060 to BR-062, BR-081, BR-105): in every tick on Node, in the alarm on Cloudflare (BR-110). */
  const purgeStores = async (now: Date): Promise<void> => {
    await deps.accounts.purgeExpired(now);
    await deps.moderation.purgeExpired(now);
  };

  /** Rooms commands; content creation is logged before anything is kept or sent (`rooms/02`, BR-060). */
  const roomCommand = <K extends BoundType>(compute: (sessionId: string, command: Command<K>, now: Date) => RoomsResult): BoundHandler<K> =>
    async (socket, bound, command, now) => {
      // Every command has `seq`; the generic `Command<K>` hides it from the checker.
      const { seq } = command as Pick<ClientMessage, "seq">;
      const result = compute(bound.sessionId, command, now);
      const creates = result.effects.some((effect) => effect.type === "roomMessage" || effect.type === "roomCreated");
      if (creates) {
        try {
          await deps.log.appendContribution({ connectionId: bound.connectionId, protocols: deps.protocols, at: now });
        } catch (cause) {
          deps.onLogError(cause);
          return [out.error(socket.key, "logUnavailable", seq)];
        }
      }
      state = result.state;
      return out.roomOutgoing(result.effects, seq);
    };

  const caller = (socket: Socket, bound: Bound): Caller => ({ key: socket.key, ip: socket.ip, sessionId: bound.sessionId });
  const privateCaller = (socket: Socket, bound: Bound): PrivateCaller => ({ key: socket.key, ...bound });
  const modCaller = (socket: Socket, bound: Bound): ModerationCaller => ({ key: socket.key, sessionId: bound.sessionId });

  const handlers: HandlerMap = {
    leave: (socket, bound, _command, now) => onLeave(socket, bound, now),
    joinRoom: roomCommand((sessionId, command) => joinRoom(state, sessionId, command.payload.roomId)),
    leaveRoom: roomCommand((sessionId, command) => leaveRoom(state, sessionId, command.payload.roomId)),
    createRoom: roomCommand((sessionId, command) => createRoom(state, { sessionId, name: command.payload.name }, deps.random)),
    postRoom: roomCommand((sessionId, command, now) =>
      postRoom(state, { sessionId, roomId: command.payload.roomId, text: command.payload.text }, now)),
    requestCode: (socket, bound, command, now) => accounts.requestCode(caller(socket, bound), command, now),
    verifyCode: (socket, bound, command, now) => accounts.verifyCode(caller(socket, bound), command, now),
    signOutEverywhere: (socket, bound, command, now) => accounts.signOutEverywhere(caller(socket, bound), command, now),
    deleteAccount: (socket, bound, command, now) => accounts.deleteAccount(caller(socket, bound), command, now),
    sendPrivate: (socket, bound, command, now) => privates.sendPrivate(privateCaller(socket, bound), command, now),
    closePrivate: (socket, bound, command, now) => privates.closePrivate(privateCaller(socket, bound), command, now),
    ignore: (socket, bound, command, now) => privates.ignore(privateCaller(socket, bound), command, now),
    unignore: (socket, bound, command, now) => privates.unignore(privateCaller(socket, bound), command, now),
    search: (socket, bound, command, now) => privates.search(privateCaller(socket, bound), command, now),
    report: (socket, bound, command, now) =>
      !canReport ? Promise.resolve([out.error(socket.key, "invalid", command.seq, "notAvailable")]) : moderation.report(modCaller(socket, bound), command, now),
    listOpenReports: (socket, bound, command, now) => moderation.listOpenReports(modCaller(socket, bound), command, now),
    expel: (socket, bound, command, now) => moderation.expel(modCaller(socket, bound), command, now),
    closeReport: (socket, bound, command, now) => moderation.closeReport(modCaller(socket, bound), command, now),
    confirmSuspension: (socket, bound, command, now) => moderation.confirmSuspension(modCaller(socket, bound), command, now),
    declineSuspension: (socket, bound, command, now) => moderation.declineSuspension(modCaller(socket, bound), command, now),
    warn: (socket, bound, command) => moderation.later(modCaller(socket, bound), command),
    listAlertedReports: (socket, bound, command, now) => moderation.listAlertedReports(modCaller(socket, bound), command, now),
    removeRoom: (socket, bound, command, now) => moderation.removeRoom(modCaller(socket, bound), command, now),
  };
  const runBound = <K extends BoundType>(type: K, socket: Socket, bound: Bound, command: Command<K>, now: Date): Promise<Outgoing[]> => {
    // Accepted by TypeScript's correlated-union rule: `handlers[K]` is `BoundHandler<K>`.
    const handler: BoundHandler<K> = handlers[type];
    return handler(socket, bound, command, now);
  };

  const dispatch = async (socket: Socket, command: ClientMessage, now: Date): Promise<Outgoing[]> => {
    const { bound } = socket;
    if (command.type === "enter" || command.type === "resume") {
      if (bound) return [out.error(socket.key, "invalid", command.seq)];
      return command.type === "enter" ? onEnter(socket, command, now) : onResume(socket, command, now);
    }
    if (!bound) return [out.error(socket.key, "forbidden", command.seq)];
    return runBound(command.type, socket, bound, command, now);
  };

  /** Answers an invalid frame; the fifth in a row also closes the socket (BR-088). */
  const invalid = (socket: Socket, answer: Outgoing): Outgoing[] => {
    socket.invalid += 1;
    if (socket.invalid === FRAME_LIMITS.invalidInRow) deps.closeSocket(socket.key, "invalidFrames");
    return [answer];
  };

  /** BR-089: a socket left without a session for `unboundMs` is closed with 1008 `unbound`. */
  const closeUnbound = (nowMs: number) => {
    for (const socket of sockets.values()) {
      if (socket.bound) {
        socket.unboundSince = undefined;
      } else if (socket.unboundSince === undefined) {
        socket.unboundSince = nowMs;
      } else if (!socket.unboundClosed && nowMs - socket.unboundSince >= UPGRADE_LIMITS.unboundMs) {
        socket.unboundClosed = true;
        deps.closeSocket(socket.key, "unbound");
      }
    }
  };

  return {
    open(socketKey, ip, port, deviceTokenHash) {
      sockets.set(socketKey, { key: socketKey, ip, port, deviceTokenHash, invalid: 0 });
    },

    receive: (socketKey, raw, now) =>
      serial(async () => {
        const socket = sockets.get(socketKey);
        if (!socket) return [];
        // Same cap on every transport, whatever the platform lets through (`platform/04`).
        if (raw.length > CAPS.frame) return invalid(socket, out.error(socket.key, "invalid", undefined, "frameTooLarge"));
        const json = parseJson(raw);
        if (!json.ok) return invalid(socket, out.error(socket.key, "invalid"));
        const parsed = clientMessage.safeParse(json.data);
        if (!parsed.success) return invalid(socket, out.error(socket.key, "invalid", seqOf(json.data)));
        socket.invalid = 0;
        const answer = await dispatch(socket, parsed.data, now);
        for (const key of closeAfter) deps.closeSocket(key);
        closeAfter = [];
        return answer;
      }),

    close: (socketKey, now) =>
      serial(async () => {
        const socket = sockets.get(socketKey);
        sockets.delete(socketKey);
        const bound = socket?.bound;
        if (!bound) return [];
        socketOfSession.delete(bound.sessionId);
        state = socketLost(state, bound.sessionId, now).state;
        await closeLine(bound.connectionId, now);
        const session = sessionOf(state, bound.sessionId);
        return [...out.memberAwayInRooms(session), ...privates.wentAway(session)];
      }),

    tick: (now) =>
      serial(async () => {
        const expired = expireAway(state, now);
        state = pruneReportAttempts(pruneDeviceClaims(pruneEntryAttempts(pruneFlood(expired.state, now), now), now), now);
        closeUnbound(now.getTime());
        for (const ip of grantFailures.keys()) {
          const recent = recentGrantFailures(ip, now.getTime());
          if (recent.length === 0) grantFailures.delete(ip);
          else grantFailures.set(ip, recent);
        }
        if (deps.maintenanceInTick ?? true) {
          try {
            await purgeStores(now);
            // Outside the queue: a slow provider must not hold the chat (ADR-0013 amendment).
            void moderation.retryMails(now);
          } catch (cause) {
            deps.onStoreError(cause);
          }
        }
        return out.roomOutgoing(expired.effects);
      }),

    async maintain(now, purge) {
      let purged = true;
      if (purge) {
        try {
          await serial(() => purgeStores(now));
        } catch (cause) {
          purged = false;
          deps.onStoreError(cause);
        }
      }
      // Awaited by the alarm, but outside the queue: a slow provider must not hold the chat.
      await moderation.retryMails(now);
      return purged;
    },

    redeemDeviceClaim: (claim, now) =>
      serial(async () => {
        const result = redeemDeviceClaim(state, deps.hashToken(claim), now, deps.random);
        if (result.kind === "refused") {
          state = result.state;
          return undefined;
        }
        try {
          await deps.accounts.saveDevice(result.token.hash, result.accountId, result.expiresAt);
        } catch (cause) {
          // The claim stays usable for a retry (`accounts/07`).
          deps.onStoreError(cause);
          return undefined;
        }
        state = result.state;
        return { token: result.token.value, expiresAt: result.expiresAt };
      }),

    signOutDevice: (tokenHash) =>
      serial(async () => {
        try {
          await deps.accounts.deleteDevice(tokenHash);
        } catch (cause) {
          // The sessions are still unlinked; the record expires with its 30 days.
          deps.onStoreError(cause);
        }
        return accounts.unlink({ by: "device", tokenHash });
      }),

    stats: () => ({ connected: state.sessions.size }),
  };
};
