/**
 * Effect mapping of the hub (`platform/04c`, issue #25): turns domain effects into protocol messages for the
 * right sockets, read against the hub's committed state.
 */
import { roomList, roomMembers, type Effect, type HubState, type PrivateEffect, type RoomEffect, type Session } from "../domain";
import type { Member, ServerMessage } from "../shared/protocol";

/** Every domain effect the hub maps. */
export type HubEffect = Effect | RoomEffect | PrivateEffect;

/** One server message for one or more sockets. */
export interface Outgoing {
  readonly to: readonly string[];
  readonly message: ServerMessage;
}

/** Payload of one server message type. */
export type Payload<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>["payload"];
type ErrorCode = Payload<"error">["code"];

/** What the mapping reads from the hub. */
export interface OutgoingSource {
  state(): HubState;
  /** Socket key of a session, if it is bound to one. */
  socketOf(sessionId: string): string | undefined;
  /** Socket keys of every bound session. */
  allSockets(): readonly string[];
}

/** A session the hub just saw in the state; missing means a hub bug, not a client error. */
export const sessionOf = (state: HubState, sessionId: string): Session => {
  const session = state.sessions.get(sessionId);
  /* v8 ignore next -- invariant: callers pass ids taken from this state. */
  if (!session) throw new Error(`hub invariant: unknown session ${sessionId}`);
  return session;
};

/** Protocol `member` union (issue #21): an away session has no profile (ADR-0011). */
export const toMember = (session: Session): Member => {
  const hasAccount = session.accountId !== undefined;
  if (session.status === "away") return { sessionId: session.id, pseudo: session.pseudo, hasAccount, away: true };
  const { gender, age, city } = session.profile;
  return {
    sessionId: session.id,
    pseudo: session.pseudo,
    hasAccount,
    away: false,
    gender,
    age,
    ...(city ? { city } : {}),
  };
};

/** Protocol `otherChatter` of a private window: the member without age and city. */
export const toOther = (session: Session): Payload<"privateWindow">["other"] => {
  const member = toMember(session);
  if (member.away) return member;
  return { sessionId: member.sessionId, pseudo: member.pseudo, hasAccount: member.hasAccount, away: false, gender: member.gender };
};

/** Private refusals sent as `error` (`platform/04c`); the others are `warning`. */
const PRIVATE_ERRORS = new Set<string>(["accountRequired", "offline"]);

/** Room effects that change a count or the set of rooms, so every list must be refreshed. */
const LIST_CHANGES = new Set<HubEffect["type"]>(["memberJoined", "memberLeft", "roomCreated", "roomDeleted"]);

/**
 * Builds the mapping. One `seq` counter numbers every server message of the hub; outgoing messages with no
 * recipient are dropped.
 */
export const createOutgoing = (source: OutgoingSource) => {
  let seq = 0;

  const send = <T extends ServerMessage["type"]>(to: readonly string[], type: T, payload: Payload<T>): Outgoing => ({
    to,
    message: { type, seq: seq++, payload } as Extract<ServerMessage, { type: T }>,
  });
  /** The text defaults to the code (issue #25). */
  const error = (socketKey: string, code: ErrorCode, replyTo?: number, text: string = code): Outgoing =>
    send([socketKey], "error", { code, message: text, replyTo });
  /** The text equals the code; the client translates it. */
  const warning = (socketKey: string, code: string, replyTo?: number): Outgoing =>
    send([socketKey], "warning", { code, message: code, replyTo });

  const keysOf = (sessionIds: readonly string[]): string[] =>
    sessionIds.flatMap((id) => {
      const key = source.socketOf(id);
      return key ? [key] : [];
    });
  /** Connected members of `roomId` other than `except`, as socket keys. */
  const othersIn = (roomId: string, except: string): string[] =>
    keysOf(roomMembers(source.state(), roomId).filter((member) => member.id !== except).map((member) => member.id));
  const roomJoined = (roomId: string): Payload<"roomJoined"> => ({
    roomId,
    members: roomMembers(source.state(), roomId).map(toMember),
  });
  const listToAll = (): Outgoing => send(source.allSockets(), "roomList", { rooms: roomList(source.state()) });
  const nonEmpty = (out: readonly Outgoing[]): Outgoing[] => out.filter((outgoing) => outgoing.to.length > 0);

  /** `memberAway` in every room of the session, to the other connected members. */
  const memberAwayInRooms = (session: Session): Outgoing[] =>
    nonEmpty(session.rooms.map((roomId) =>
      send(othersIn(roomId, session.id), "memberAway", { roomId, sessionId: session.id, pseudo: session.pseudo })));
  /** `memberBack` in every room of the session, to the other connected members. */
  const memberBackInRooms = (session: Session): Outgoing[] =>
    nonEmpty(session.rooms.map((roomId) =>
      send(othersIn(roomId, session.id), "memberBack", { roomId, member: toMember(session) })));

  /** Brick 6 effects to messages; `undefined` for the other effects. */
  const privateOutgoing = (effect: HubEffect, replyTo?: number): Outgoing | undefined => {
    switch (effect.type) {
      case "privateRefused": {
        const [key] = keysOf([effect.sessionId]);
        if (key === undefined) return undefined;
        return PRIVATE_ERRORS.has(effect.reason)
          ? error(key, effect.reason as ErrorCode, replyTo)
          : warning(key, effect.reason, replyTo);
      }
      case "privateWindowOpened":
        return send(keysOf([effect.sessionId]), "privateWindow", {
          conversationId: effect.conversationId,
          other: toOther(sessionOf(source.state(), effect.otherSessionId)),
        });
      case "privateMessage":
        return send(keysOf(effect.recipients), "privateMessage", {
          conversationId: effect.conversationId,
          authorSessionId: effect.authorSessionId,
          text: effect.text,
          sentAt: effect.sentAt.toISOString(),
        });
      case "ignoreUpdated":
        return send(keysOf([effect.sessionId]), "ignoreUpdated", { ignored: [...effect.ignored] });
      case "partnerLeft":
        // No `roomId`: the chatter left the whole chat (`web-ui/07`).
        return send(keysOf(effect.recipients), "memberLeft", { sessionId: effect.sessionId, pseudo: effect.pseudo });
      default:
        return undefined;
    }
  };

  /** Domain effects to messages, read against the already committed state. */
  const roomOutgoing = (effects: readonly HubEffect[], replyTo?: number): Outgoing[] => {
    const out: Outgoing[] = [];
    for (const effect of effects) {
      switch (effect.type) {
        case "roomJoined":
          out.push(send(keysOf([effect.sessionId]), "roomJoined", roomJoined(effect.roomId)));
          break;
        case "memberJoined":
          out.push(send(othersIn(effect.roomId, effect.sessionId), "memberJoined", {
            roomId: effect.roomId,
            member: toMember(sessionOf(source.state(), effect.sessionId)),
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
          out.push(...keysOf([effect.sessionId]).map((key) => warning(key, effect.reason, replyTo)));
          break;
        default: {
          const mapped = privateOutgoing(effect, replyTo);
          if (mapped) out.push(mapped);
          break;
        }
      }
    }
    if (effects.some((effect) => LIST_CHANGES.has(effect.type))) out.push(listToAll());
    return nonEmpty(out);
  };

  return { send, error, warning, keysOf, roomJoined, memberAwayInRooms, memberBackInRooms, roomOutgoing };
};

/** What `createOutgoing` returns, shared with `hub-accounts`. */
export type OutgoingModule = ReturnType<typeof createOutgoing>;
