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
  pruneEntryAttempts,
  pruneFlood,
  resume,
  roomList,
  roomMembers,
  socketLost,
  type ConnectionLogStore,
  type Effect,
  type HubState,
  type OfficialRoom,
  type Random,
  type RoomEffect,
  type Session,
} from "../domain";
import { CAPS, clientMessage, type ClientMessage, type Member, type ServerMessage } from "../shared/protocol";

/** What a transport plugs into the hub. */
export interface HubDeps {
  readonly officialRooms: readonly OfficialRoom[];
  readonly random: Random;
  /** Same keyed hash as `random.token()` (`entry/07`). */
  readonly hashToken: (value: string) => string;
  readonly log: ConnectionLogStore;
  /** Protocols of the connection line, for example `HTTP/1.1 WebSocket` (BR-060). */
  readonly protocols: string;
  /** Called on every failed log write; a failed open or contribution also refuses the command. */
  readonly onLogError: (error: unknown) => void;
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
  open(socketKey: string, ip: string, port?: number): void;
  receive(socketKey: string, raw: string, now: Date): Promise<Outgoing[]>;
  close(socketKey: string, now: Date): Promise<Outgoing[]>;
  tick(now: Date): Promise<Outgoing[]>;
  stats(): Stats;
}

interface Socket {
  readonly key: string;
  readonly ip: string;
  readonly port?: number;
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

  const onEnter = async (socket: Socket, command: Command<"enter">, now: Date): Promise<Outgoing[]> => {
    const { payload } = command;
    const result = enter(state, {
      pseudo: payload.pseudo,
      gender: payload.gender,
      age: payload.age,
      city: payload.city,
      adultConfirmed: payload.adultConfirmed,
      termsAccepted: payload.termsAccepted,
      ip: socket.ip,
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
   * that socket loses it as if it had closed, so the resume can take over (`entry/02b`).
   */
  const releaseStale = async (resumeTokenHash: string, now: Date): Promise<void> => {
    const session = [...state.sessions.values()].find(
      (candidate) => candidate.status === "connected" && candidate.resumeTokenHash === resumeTokenHash,
    );
    const key = session && socketOfSession.get(session.id);
    const stale = key === undefined ? undefined : sockets.get(key);
    if (!session || !stale?.bound) return;
    const { connectionId } = stale.bound;
    stale.bound = undefined;
    socketOfSession.delete(session.id);
    state = socketLost(state, session.id, now).state;
    await closeLine(connectionId, now);
  };

  const onResume = async (socket: Socket, command: Command<"resume">, now: Date): Promise<Outgoing[]> => {
    const { profile, resumeToken } = command.payload;
    const resumeTokenHash = deps.hashToken(resumeToken);
    await releaseStale(resumeTokenHash, now);
    const result = resume(state, {
      resumeTokenHash,
      ip: socket.ip,
      gender: profile.gender,
      age: profile.age,
      city: profile.city,
      // Accounts arrive with brick 5.
      accountStillExists: true,
    }, now, deps.random);
    const [effect] = result.effects;
    if (effect?.type === "resumed") {
      if (!(await bind(socket, effect.sessionId, result.state, now))) {
        return [error(socket, "logUnavailable", "logUnavailable", command.seq)];
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
        }),
        send([socket.key], "roomList", { rooms: roomList(state) }),
        ...presenceInRooms(session, "memberBack"),
      ];
    }
    if (effect?.type === "resumeRefused") return [send([socket.key], "resumeRefused", {})];
    return [error(socket, "invalid", "invalid", command.seq)];
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
    return onRooms(socket, bound, command, now);
  };

  return {
    open(socketKey, ip, port) {
      sockets.set(socketKey, { key: socketKey, ip, port });
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
      serial(() => {
        const expired = expireAway(state, now);
        state = pruneEntryAttempts(pruneFlood(expired.state, now), now);
        return Promise.resolve(roomOutgoing(expired.effects));
      }),

    stats: () => ({ connected: state.sessions.size }),
  };
};
