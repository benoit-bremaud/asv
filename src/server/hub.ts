/**
 * Transport-neutral hub (`platform/04c`): holds the live state, validates incoming messages, calls the
 * pure domain, writes the connection log and maps domain effects to protocol messages. Transports own the
 * sockets and send what it returns (`platform/02`).
 */
import {
  checkCode,
  closeAccount,
  createRoom,
  decideCodeRequest,
  emptyHubState,
  enter,
  expireAway,
  joinRoom,
  leave,
  leaveRoom,
  linkAccount,
  normaliseEmail,
  postRoom,
  pruneDeviceClaims,
  pruneEntryAttempts,
  pruneFlood,
  redeemDeviceClaim,
  resume,
  roomList,
  roomMembers,
  socketLost,
  unlinkSessions,
  type CodeRandom,
  type ConnectionLogStore,
  type Effect,
  type HubState,
  type Mailer,
  type OfficialRoom,
  type RoomEffect,
  type SessionFilter,
  type Session,
} from "../domain";
import type { AccountIo } from "./account-io";
import { CAPS, clientMessage, type ClientMessage, type Member, type ServerMessage } from "../shared/protocol";

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
  /** Asks the transport to close a socket whose session a resume took over; its `close` then follows. */
  readonly closeSocket: (socketKey: string) => void;
  /** Account and vault stores behind the crypto of ADR-0017 (`platform/04d`). */
  readonly accounts: AccountIo;
  readonly mailer: Mailer;
  /** Called on every failed account store write or purge; the command then gets `warning unavailable`. */
  readonly onStoreError: (error: unknown) => void;
}

/** A device token set by `POST /account/device` (BR-073). */
export interface DeviceToken {
  readonly token: string;
  readonly expiresAt: Date;
}

/** One server message for one or more sockets. */
export interface Outgoing {
  readonly to: readonly string[];
  readonly message: ServerMessage;
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
}

type Payload<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>["payload"];
type Command<T extends ClientMessage["type"]> = Extract<ClientMessage, { type: T }>;
type ErrorCode = Payload<"error">["code"];
type Bound = NonNullable<Socket["bound"]>;

/** A session the hub just saw in the state; missing means a hub bug, not a client error. */
const sessionOf = (state: HubState, sessionId: string): Session => {
  const session = state.sessions.get(sessionId);
  /* v8 ignore next -- invariant: callers pass ids taken from this state. */
  if (!session) throw new Error(`hub invariant: unknown session ${sessionId}`);
  return session;
};

const ACCOUNT_COMMANDS = new Set<ClientMessage["type"]>(["requestCode", "verifyCode", "signOutEverywhere", "deleteAccount"]);

/** Room effects that change a count or the set of rooms, so every list must be refreshed. */
const LIST_CHANGES = new Set<(Effect | RoomEffect)["type"]>(["memberJoined", "memberLeft", "roomCreated", "roomDeleted"]);

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

/** Protocol `member` union (issue #21): an away session has no profile (ADR-0011). */
const toMember = (session: Session): Member => {
  if (session.status === "away") return { sessionId: session.id, pseudo: session.pseudo, away: true };
  const { gender, age, city } = session.profile;
  return {
    sessionId: session.id,
    pseudo: session.pseudo,
    away: false,
    gender,
    age,
    ...(city ? { city } : {}),
  };
};

/** Builds the hub for one transport. */
export const createHub = (deps: HubDeps): Hub => {
  let state: HubState = emptyHubState(deps.officialRooms);
  const sockets = new Map<string, Socket>();
  const socketOfSession = new Map<string, string>();
  let seq = 0;
  // Log writes are awaited: every operation runs after the previous one, so none sees a stale state.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  };

  const message = <T extends ServerMessage["type"]>(type: T, payload: Payload<T>): ServerMessage =>
    ({ type, seq: seq++, payload }) as Extract<ServerMessage, { type: T }>;
  const send = <T extends ServerMessage["type"]>(to: readonly string[], type: T, payload: Payload<T>): Outgoing => ({
    to,
    message: message(type, payload),
  });
  const error = (socket: Socket, code: ErrorCode, text: string, replyTo?: number): Outgoing =>
    send([socket.key], "error", { code, message: text, replyTo });

  const keysOf = (sessionIds: readonly string[]): string[] =>
    sessionIds.flatMap((id) => {
      const key = socketOfSession.get(id);
      return key ? [key] : [];
    });
  /** Connected members of `roomId` other than `except`, as socket keys. */
  const othersIn = (roomId: string, except: string): string[] =>
    keysOf(roomMembers(state, roomId).filter((member) => member.id !== except).map((member) => member.id));
  const roomJoined = (roomId: string): Payload<"roomJoined"> => ({
    roomId,
    members: roomMembers(state, roomId).map(toMember),
  });
  const listToAll = (): Outgoing => send([...socketOfSession.values()], "roomList", { rooms: roomList(state) });
  /** `memberAway` or `memberBack` in every room of the session, to the other connected members. */
  const presenceInRooms = (session: Session, type: "memberAway" | "memberBack"): Outgoing[] =>
    session.rooms
      .map((roomId) =>
        type === "memberAway"
          ? send(othersIn(roomId, session.id), type, { roomId, sessionId: session.id, pseudo: session.pseudo })
          : send(othersIn(roomId, session.id), type, { roomId, member: toMember(session) }),
      )
      .filter((outgoing) => outgoing.to.length > 0);

  /** Room effects to messages, read against the already committed `state`. */
  const roomOutgoing = (effects: readonly (Effect | RoomEffect)[], replyTo?: number): Outgoing[] => {
    const out: Outgoing[] = [];
    for (const effect of effects) {
      switch (effect.type) {
        case "roomJoined":
          out.push(send(keysOf([effect.sessionId]), "roomJoined", roomJoined(effect.roomId)));
          break;
        case "memberJoined":
          out.push(send(othersIn(effect.roomId, effect.sessionId), "memberJoined", {
            roomId: effect.roomId,
            member: toMember(sessionOf(state, effect.sessionId)),
          }));
          break;
        case "memberLeft":
          out.push(send(othersIn(effect.roomId, effect.sessionId), "memberLeft", {
            roomId: effect.roomId,
            sessionId: effect.sessionId,
            pseudo: effect.pseudo,
          }));
          break;
        case "roomMessage":
          out.push(send(keysOf(effect.recipients), "roomMessage", {
            roomId: effect.roomId,
            authorSessionId: effect.authorSessionId,
            pseudo: effect.pseudo,
            gender: effect.gender,
            text: effect.text,
            sentAt: effect.sentAt.toISOString(),
          }));
          break;
        case "roomRefused":
          out.push(send(keysOf([effect.sessionId]), "warning", { code: effect.reason, message: effect.reason, replyTo }));
          break;
        default:
          break;
      }
    }
    if (effects.some((effect) => LIST_CHANGES.has(effect.type))) out.push(listToAll());
    return out.filter((outgoing) => outgoing.to.length > 0);
  };

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

  const warning = (socket: Socket, code: string, replyTo?: number): Outgoing =>
    send([socket.key], "warning", { code, message: code, replyTo });

  /** Unlinks the matching sessions and tells their sockets (UC18, UC19). */
  const unlink = (filter: SessionFilter): Outgoing[] => {
    const result = unlinkSessions(state, filter);
    state = result.state;
    const to = keysOf(result.unlinked);
    return to.length > 0 ? [send(to, "accountUnlinked", {})] : [];
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

  /** UC17 steps 1–3 (`accounts/02`): refusals are explicit only when they reveal nothing about the address. */
  const onRequestCode = async (socket: Socket, bound: Bound, command: Command<"requestCode">, now: Date): Promise<Outgoing[]> => {
    const email = normaliseEmail(command.payload.email);
    // An invalid address never reaches the store.
    if (email === undefined) return [warning(socket, "emailInvalid", command.seq)];
    const { facts, emailKeyedHash, ipKeyedHash } = await deps.accounts.codeFacts(email, socket.ip, now);
    const decision = decideCodeRequest(facts, now, deps.random);
    if (decision.kind === "refused") return [warning(socket, decision.reason, command.seq)];
    if (decision.kind === "issue") {
      await deps.accounts.saveIssued({
        sessionId: bound.sessionId,
        email,
        emailKeyedHash,
        ipKeyedHash,
        code: decision.code,
        remember: command.payload.remember,
        expiresAt: decision.expiresAt,
        now,
      });
      // Not awaited: the answer must not depend on the provider (ADR-0013 amendment).
      void deps.mailer.sendCode(email, decision.code).catch(deps.onStoreError);
    }
    return [send([socket.key], "codeSent", {})];
  };

  /** UC17 steps 4–6. */
  const onVerifyCode = async (socket: Socket, bound: Bound, command: Command<"verifyCode">, now: Date): Promise<Outgoing[]> => {
    const pending = await deps.accounts.loadPending(bound.sessionId);
    if (!pending) return [warning(socket, "codeMissing", command.seq)];
    const check = checkCode(pending.stored, await deps.accounts.codeMatches(pending, command.payload.code), now);
    if (check.kind === "refused") {
      if (check.reason !== "expired") await deps.accounts.recordWrongTry(pending, now);
      if (check.reason === "wrong") {
        await deps.accounts.saveTries(pending, check.triesLeft);
        return [send([socket.key], "warning", { code: "codeWrong", message: "codeWrong", replyTo: command.seq, triesLeft: check.triesLeft })];
      }
      await deps.accounts.deleteCode(bound.sessionId);
      return [warning(socket, check.reason === "expired" ? "codeExpired" : "codeExhausted", command.seq)];
    }
    const facts = await deps.accounts.linkFacts(pending, now);
    const result = linkAccount(state, {
      sessionId: bound.sessionId,
      email: pending.email,
      remember: pending.stored.remember,
      blocked: facts.blocked,
      existing: facts.existing,
      carryOver: facts.carryOver,
    }, now, deps.random);
    await deps.accounts.deleteCode(bound.sessionId);
    if (result.kind === "refused") return [warning(socket, result.reason, command.seq)];
    await deps.accounts.saveAccount(result.account, facts.emailKeyedHash, result.created);
    state = result.state;
    return [send([socket.key], "accountLinked", {
      accountId: result.account.id,
      ...(result.deviceClaim ? { deviceClaim: result.deviceClaim } : {}),
    })];
  };

  /** UC18 "everywhere" and UC19, over the WebSocket. */
  const onAccountWide = async (socket: Socket, bound: Bound, command: Command<"signOutEverywhere" | "deleteAccount">, now: Date): Promise<Outgoing[]> => {
    const accountId = sessionOf(state, bound.sessionId).accountId;
    if (!accountId) return [warning(socket, "notSignedIn", command.seq)];
    if (command.type === "deleteAccount") {
      const found = await deps.accounts.accountById(accountId);
      if (found) {
        const closure = closeAccount(found.account, now);
        await deps.accounts.close(closure.vault, found.emailKeyedHash, closure.carryOver);
      }
    } else {
      await deps.accounts.deleteAllDevices(accountId);
    }
    return unlink({ by: "account", accountId });
  };

  /** Account commands; a failed store call answers `warning unavailable` and changes nothing in memory. */
  const onAccount = async (socket: Socket, bound: Bound, command: ClientMessage, now: Date): Promise<Outgoing[]> => {
    try {
      switch (command.type) {
        case "requestCode":
          return await onRequestCode(socket, bound, command, now);
        case "verifyCode":
          return await onVerifyCode(socket, bound, command, now);
        case "signOutEverywhere":
        case "deleteAccount":
          return await onAccountWide(socket, bound, command, now);
        /* v8 ignore next 2 -- invariant: dispatch passes ACCOUNT_COMMANDS only. */
        default:
          return [error(socket, "invalid", "notAvailable", command.seq)];
      }
    } catch (cause) {
      deps.onStoreError(cause);
      return [warning(socket, "unavailable", command.seq)];
    }
  };

  const onEnter = async (socket: Socket, command: Command<"enter">, now: Date): Promise<Outgoing[]> => {
    const { payload } = command;
    const device = await deviceAccount(socket, now);
    if (device === "unavailable") return [warning(socket, "unavailable", command.seq)];
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
    }, now, deps.random);
    const [effect] = result.effects;
    if (effect?.type === "entered") {
      if (!(await bind(socket, effect.sessionId, result.state, now))) {
        return [error(socket, "logUnavailable", "logUnavailable", command.seq)];
      }
      return [send([socket.key], "entered", {
        sessionId: effect.sessionId,
        resumeToken: effect.resumeToken,
        roomList: roomList(state),
        isModerator: false,
        ...(effect.accountId ? { accountId: effect.accountId } : {}),
        ...(device.stale ? { staleDevice: true } : {}),
      })];
    }
    state = result.state;
    if (effect?.type === "entryRefused") {
      return [send([socket.key], "entryRefused", { reason: effect.reason, bannedUntil: effect.bannedUntil?.toISOString() })];
    }
    return [error(socket, "invalid", "invalid", command.seq)];
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
    const awayIfReleased = () => (released ? presenceInRooms(sessionOf(state, released), "memberAway") : []);
    let accountStillExists: boolean;
    try {
      accountStillExists = await linkedAccountExists(resumeTokenHash);
    } catch (cause) {
      deps.onStoreError(cause);
      return [warning(socket, "unavailable", command.seq), ...awayIfReleased()];
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
        return [error(socket, "logUnavailable", "logUnavailable", command.seq), ...awayIfReleased()];
      }
      const session = sessionOf(state, effect.sessionId);
      return [
        send([socket.key], "resumed", {
          sessionId: session.id,
          pseudo: session.pseudo,
          resumeToken: effect.resumeToken,
          rooms: session.rooms.map(roomJoined),
          windows: [],
          buffered: [],
          ...(session.accountId ? { accountId: session.accountId } : {}),
        }),
        send([socket.key], "roomList", { rooms: roomList(state) }),
        ...presenceInRooms(session, "memberBack"),
      ];
    }
    if (effect?.type === "resumeRefused") return [send([socket.key], "resumeRefused", {})];
    return [error(socket, "invalid", "invalid", command.seq), ...awayIfReleased()];
  };

  const onLeave = async (socket: Socket, bound: Bound, now: Date): Promise<Outgoing[]> => {
    const result = leave(state, bound.sessionId);
    state = result.state;
    socketOfSession.delete(bound.sessionId);
    socket.bound = undefined;
    await closeLine(bound.connectionId, now);
    return roomOutgoing(result.effects);
  };

  /** Rooms commands; content creation is logged before anything is kept or sent (`rooms/02`, BR-060). */
  const onRooms = async (socket: Socket, bound: Bound, command: ClientMessage, now: Date): Promise<Outgoing[]> => {
    const { sessionId } = bound;
    let result;
    switch (command.type) {
      case "joinRoom":
        result = joinRoom(state, sessionId, command.payload.roomId);
        break;
      case "leaveRoom":
        result = leaveRoom(state, sessionId, command.payload.roomId);
        break;
      case "createRoom":
        result = createRoom(state, { sessionId, name: command.payload.name }, deps.random);
        break;
      case "postRoom":
        result = postRoom(state, { sessionId, roomId: command.payload.roomId, text: command.payload.text }, now);
        break;
      default:
        return [error(socket, "invalid", "notAvailable", command.seq)];
    }
    const creates = result.effects.some((effect) => effect.type === "roomMessage" || effect.type === "roomCreated");
    if (creates) {
      try {
        await deps.log.appendContribution({ connectionId: bound.connectionId, protocols: deps.protocols, at: now });
      } catch (cause) {
        deps.onLogError(cause);
        return [error(socket, "logUnavailable", "logUnavailable", command.seq)];
      }
    }
    state = result.state;
    return roomOutgoing(result.effects, command.seq);
  };

  const dispatch = async (socket: Socket, command: ClientMessage, now: Date): Promise<Outgoing[]> => {
    const { bound } = socket;
    if (command.type === "enter" || command.type === "resume") {
      if (bound) return [error(socket, "invalid", "invalid", command.seq)];
      return command.type === "enter" ? onEnter(socket, command, now) : onResume(socket, command, now);
    }
    if (!bound) return [error(socket, "forbidden", "forbidden", command.seq)];
    if (command.type === "leave") return onLeave(socket, bound, now);
    if (ACCOUNT_COMMANDS.has(command.type)) return onAccount(socket, bound, command, now);
    return onRooms(socket, bound, command, now);
  };

  return {
    open(socketKey, ip, port, deviceTokenHash) {
      sockets.set(socketKey, { key: socketKey, ip, port, deviceTokenHash });
    },

    receive: (socketKey, raw, now) =>
      serial(async () => {
        const socket = sockets.get(socketKey);
        if (!socket) return [];
        // Same cap on every transport, whatever the platform lets through (`platform/04`).
        if (raw.length > CAPS.frame) return [error(socket, "invalid", "frameTooLarge")];
        const json = parseJson(raw);
        if (!json.ok) return [error(socket, "invalid", "invalid")];
        const parsed = clientMessage.safeParse(json.data);
        if (!parsed.success) return [error(socket, "invalid", "invalid", seqOf(json.data))];
        return dispatch(socket, parsed.data, now);
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
        return presenceInRooms(sessionOf(state, bound.sessionId), "memberAway");
      }),

    tick: (now) =>
      serial(async () => {
        const expired = expireAway(state, now);
        state = pruneDeviceClaims(pruneEntryAttempts(pruneFlood(expired.state, now), now), now);
        try {
          await deps.accounts.purgeExpired(now);
        } catch (cause) {
          deps.onStoreError(cause);
        }
        return roomOutgoing(expired.effects);
      }),

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
        return unlink({ by: "device", tokenHash });
      }),

    stats: () => ({ connected: state.sessions.size }),
  };
};
