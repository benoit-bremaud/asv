/**
 * Rooms: list, join, leave, create and post (UC2 to UC5), study `rooms/07-class-domain-api`.
 * Every function is pure: `(state, command, now, random) → { state, effects }`.
 */
import type { DeviceClaim } from "./accounts";
import type { ConnectedSession, EntryState, Gender, Random, Session } from "./entry";
import { canonicalPseudo, containsReservedWord, foldPseudo, PSEUDO_CHARS } from "./pseudo";

/** V1 values of BR-020, BR-021, BR-023 and BR-024, tunable here only (BR-030 lengths live in the name pattern). */
export const ROOM_LIMITS = {
  maxTextLength: 500,
  floodMessages: 5,
  floodWindowMs: 10_000,
  capacity: 50,
  maxRoomsPerSession: 10,
} as const;

/** BR-030: pseudo characters (BR-001) plus `'`, `&`, `!`, `?`, words split by single spaces, 3 to 30 code points. */
const WORD = `[${PSEUDO_CHARS}'&!?]+`;
const ROOM_NAME_PATTERN = new RegExp(`^(?=.{3,30}$)${WORD}(?: ${WORD})*$`, "u");

/** Official rooms are themed or regional (BR-033), chatters create user rooms (BR-030). */
export type RoomKind = "themed" | "regional" | "user";

/** Room metadata; members are the sessions listing the room id (`rooms/07`). */
export interface Room {
  readonly id: string;
  readonly name: string;
  readonly kind: RoomKind;
  /** Set only on a user room while its creator is a member (BR-031). */
  readonly ownerId?: string;
}

/** An entry of the official rooms configuration (BR-033). */
export interface OfficialRoom {
  readonly id: string;
  readonly name: string;
  readonly kind: "themed" | "regional";
}

/** The hub state (`platform/04b`); brick 6 adds conversations and ignore lists. */
export interface HubState extends EntryState {
  readonly rooms: ReadonlyMap<string, Room>;
  /** Times of the accepted messages of each session in the flood window (BR-021). */
  readonly flood: ReadonlyMap<string, readonly Date[]>;
  /** Device claims waiting for `POST /account/device`, keyed by claim hash (BR-073). */
  readonly deviceClaims: ReadonlyMap<string, DeviceClaim>;
}

/** One line of the room list (UC2). */
export interface RoomSummary {
  readonly id: string;
  readonly name: string;
  readonly kind: RoomKind;
  readonly count: number;
}

/** Reason of a `roomRefused` effect, sent to the client as the protocol `warning` code. */
export type RoomRefusal =
  | "unknownRoom"
  | "notMember"
  | "full"
  | "tooManyRooms"
  | "empty"
  | "tooLong"
  | "flood"
  | "nameInvalid"
  | "nameTaken"
  | "alreadyOwner";

/** UC5 form. Raw strings are bounded by the protocol layer (#13). */
export interface CreateRoomCommand {
  readonly sessionId: string;
  readonly name: string;
}

/** UC4 form. */
export interface PostRoomCommand {
  readonly sessionId: string;
  readonly roomId: string;
  readonly text: string;
}

/** What the hub must send; refusals map to the protocol `warning { code: reason }`. */
export type RoomEffect =
  | { readonly type: "roomJoined"; readonly sessionId: string; readonly roomId: string }
  | { readonly type: "memberJoined"; readonly roomId: string; readonly sessionId: string; readonly pseudo: string }
  | { readonly type: "memberLeft"; readonly roomId: string; readonly sessionId: string; readonly pseudo: string }
  | { readonly type: "roomCreated"; readonly roomId: string; readonly sessionId: string }
  | { readonly type: "roomDeleted"; readonly roomId: string }
  | {
      readonly type: "roomMessage";
      readonly roomId: string;
      readonly authorSessionId: string;
      readonly pseudo: string;
      /** From the author's profile, for the pseudo colour (ADR-0006). */
      readonly gender: Gender;
      readonly text: string;
      readonly sentAt: Date;
      /** Connected members, author included (echo). */
      readonly recipients: readonly string[];
    }
  | { readonly type: "roomRefused"; readonly sessionId: string; readonly reason: RoomRefusal };

/** Output of every rooms function. */
export interface RoomsResult {
  readonly state: HubState;
  readonly effects: readonly RoomEffect[];
}

const result = (state: HubState, ...effects: RoomEffect[]): RoomsResult => ({ state, effects });

const refused = (state: HubState, sessionId: string, reason: RoomRefusal): RoomsResult =>
  result(state, { type: "roomRefused", sessionId, reason });

const officialRoomMap = (officialRooms: readonly OfficialRoom[]): Map<string, Room> =>
  new Map(officialRooms.map((room) => [room.id, { id: room.id, name: room.name, kind: room.kind }]));

/** State of a fresh hub with the configured official rooms (BR-033). */
export const emptyHubState = (officialRooms: readonly OfficialRoom[]): HubState => ({
  sessions: new Map(),
  pseudoIndex: new Map(),
  entryAttempts: new Map(),
  rooms: officialRoomMap(officialRooms),
  flood: new Map(),
  deviceClaims: new Map(),
});

/** Members of a room, connected and away (BR-023 counts both). */
export const roomMembers = (state: HubState, roomId: string): Session[] =>
  [...state.sessions.values()].filter((session) => session.rooms.includes(roomId));

/** BR-030 uniqueness key: folded, letters and digits only, so `Paris.` is taken by `Paris`. */
const roomNameKey = (name: string): string => foldPseudo(name).replace(/[^a-z0-9]/g, "");

/** A room as kept in the state: only its known fields, owner dropped (BR-031). */
const withoutOwner = (room: Room): Room => ({ id: room.id, name: room.name, kind: room.kind });

/**
 * Rebuild after hibernation (ADR-0011): sessions come from socket attachments and away records, user rooms
 * from the `{ id, name, ownerId }` refs they carry (`platform/04b`). The refs come from many sockets, so the
 * rules are checked again: first ref per id and per name key wins (BR-030), one room per owner (BR-031),
 * owners must be members, memberships of unknown rooms and duplicates are dropped, empty user rooms too.
 */
export const restoreHubState = (
  officialRooms: readonly OfficialRoom[],
  sessions: readonly Session[],
  userRooms: readonly Room[],
): HubState => {
  const rooms = officialRoomMap(officialRooms);
  const names = new Set([...rooms.values()].map((room) => roomNameKey(room.name)));
  const owners = new Set<string>();
  // An owner claim counts only from a member, so a stale ref cannot take the slot of the real room.
  const isMember = (sessionId: string, roomId: string): boolean =>
    sessions.some((session) => session.id === sessionId && session.rooms.includes(roomId));
  for (const room of userRooms) {
    const key = roomNameKey(room.name);
    if (room.kind !== "user" || rooms.has(room.id) || names.has(key)) continue;
    names.add(key);
    const owned = room.ownerId !== undefined && !owners.has(room.ownerId) && isMember(room.ownerId, room.id);
    if (owned) owners.add(room.ownerId);
    rooms.set(room.id, owned ? { ...withoutOwner(room), ownerId: room.ownerId } : withoutOwner(room));
  }
  const kept = sessions.map((session) => ({
    ...session,
    rooms: [...new Set(session.rooms)].filter((id) => rooms.has(id)),
  }));
  const state: HubState = {
    sessions: new Map(kept.map((session) => [session.id, session])),
    pseudoIndex: new Map(kept.map((session) => [foldPseudo(session.pseudo), session.id])),
    entryAttempts: new Map(),
    rooms,
    flood: new Map(),
    deviceClaims: new Map(),
  };
  for (const room of [...rooms.values()].filter((candidate) => candidate.kind === "user")) {
    const members = roomMembers(state, room.id);
    if (members.length === 0) rooms.delete(room.id);
  }
  return state;
};

/** UC2: official rooms in configuration order, then user rooms in creation order (map insertion order). */
export const roomList = (state: HubState): RoomSummary[] => {
  const all = [...state.rooms.values()];
  return [...all.filter((room) => room.kind !== "user"), ...all.filter((room) => room.kind === "user")].map(
    (room) => ({ id: room.id, name: room.name, kind: room.kind, count: roomMembers(state, room.id).length }),
  );
};

const withSession = (state: HubState, session: Session): HubState => ({
  ...state,
  sessions: new Map(state.sessions).set(session.id, session),
});

const withRooms = (state: HubState, rooms: Map<string, Room>): HubState => ({ ...state, rooms });

const connectedSession = (state: HubState, sessionId: string): ConnectedSession | undefined => {
  const session = state.sessions.get(sessionId);
  return session?.status === "connected" ? session : undefined;
};

/** Adds `roomId` to the session's rooms and announces it (UC3 step 2 and 3). */
const addMember = (state: HubState, session: Session, roomId: string): RoomsResult =>
  result(
    withSession(state, { ...session, rooms: [...session.rooms, roomId] }),
    { type: "roomJoined", sessionId: session.id, roomId },
    { type: "memberJoined", roomId, sessionId: session.id, pseudo: session.pseudo },
  );

/** UC3, BR-023, BR-024. */
export const joinRoom = (state: HubState, sessionId: string, roomId: string): RoomsResult => {
  const session = connectedSession(state, sessionId);
  if (!session) return result(state);
  if (!state.rooms.has(roomId)) return refused(state, sessionId, "unknownRoom");
  if (session.rooms.includes(roomId)) return result(state, { type: "roomJoined", sessionId, roomId });
  if (session.rooms.length >= ROOM_LIMITS.maxRoomsPerSession) return refused(state, sessionId, "tooManyRooms");
  if (roomMembers(state, roomId).length >= ROOM_LIMITS.capacity) return refused(state, sessionId, "full");
  return addMember(state, session, roomId);
};

/**
 * Announces that `session` left `roomIds`, ends its ownership (BR-031) and deletes user rooms it leaves
 * empty (BR-032). `session` may still be in `state.sessions` or already removed: it is never counted as a
 * remaining member. Does not change `session.rooms` (the caller does). Internal to the domain.
 */
export const vacateRooms = (state: HubState, session: Session, roomIds: readonly string[]): RoomsResult => {
  const rooms = new Map(state.rooms);
  const effects: RoomEffect[] = [];
  for (const roomId of roomIds) {
    const room = rooms.get(roomId);
    // Already deleted by another session closed in the same call: nobody is left to tell.
    if (!room) continue;
    effects.push({ type: "memberLeft", roomId, sessionId: session.id, pseudo: session.pseudo });
    if (room.kind !== "user") continue;
    const remaining = [...state.sessions.values()].some(
      (other) => other.id !== session.id && other.rooms.includes(roomId),
    );
    if (!remaining) {
      rooms.delete(roomId);
      effects.push({ type: "roomDeleted", roomId });
    } else if (room.ownerId === session.id) {
      rooms.set(roomId, withoutOwner(room));
    }
  }
  return { state: withRooms(state, rooms), effects };
};

/** Leaving one room (UC3 alternative ending), with BR-031 and BR-032 applied by `vacateRooms`. Not a member → nothing. */
export const leaveRoom = (state: HubState, sessionId: string, roomId: string): RoomsResult => {
  const session = state.sessions.get(sessionId);
  if (!session?.rooms.includes(roomId)) return result(state);
  const left = vacateRooms(state, session, [roomId]);
  return {
    state: withSession(left.state, { ...session, rooms: session.rooms.filter((id) => id !== roomId) }),
    effects: left.effects,
  };
};

/** BR-030 on the canonical, trimmed name; at least one letter or digit. */
const isValidRoomName = (name: string): boolean =>
  ROOM_NAME_PATTERN.test(name) && roomNameKey(name).length > 0 && !containsReservedWord(name);

/** UC5, BR-030, BR-031, BR-024: refusals `nameInvalid`, `nameTaken`, `alreadyOwner`, `tooManyRooms`, in that order. */
export const createRoom = (state: HubState, command: CreateRoomCommand, random: Random): RoomsResult => {
  const session = connectedSession(state, command.sessionId);
  if (!session) return result(state);
  const name = canonicalPseudo(command.name).trim();
  if (!isValidRoomName(name)) return refused(state, session.id, "nameInvalid");
  const key = roomNameKey(name);
  const existing = [...state.rooms.values()];
  if (existing.some((room) => roomNameKey(room.name) === key)) return refused(state, session.id, "nameTaken");
  if (existing.some((room) => room.ownerId === session.id)) return refused(state, session.id, "alreadyOwner");
  if (session.rooms.length >= ROOM_LIMITS.maxRoomsPerSession) return refused(state, session.id, "tooManyRooms");
  const room: Room = { id: random.id(), name, kind: "user", ownerId: session.id };
  const joined = addMember(withRooms(state, new Map(state.rooms).set(room.id, room)), session, room.id);
  return {
    state: joined.state,
    effects: [{ type: "roomCreated", roomId: room.id, sessionId: session.id }, ...joined.effects],
  };
};

/** BR-021: accepted messages of the session still in the window. */
const recentMessages = (state: HubState, sessionId: string, now: Date): Date[] => {
  const since = now.getTime() - ROOM_LIMITS.floodWindowMs;
  return (state.flood.get(sessionId) ?? []).filter((at) => at.getTime() > since);
};

/** UC4, BR-020, BR-021. The text stays raw: smileys are rendered by `web-ui` (BR-022). */
export const postRoom = (state: HubState, command: PostRoomCommand, now: Date): RoomsResult => {
  const session = connectedSession(state, command.sessionId);
  if (!session) return result(state);
  if (!session.rooms.includes(command.roomId)) return refused(state, session.id, "notMember");
  const text = command.text.trim();
  if (text.length === 0) return refused(state, session.id, "empty");
  // BR-020 counts characters (code points), not UTF-16 units.
  if ([...text].length > ROOM_LIMITS.maxTextLength) return refused(state, session.id, "tooLong");
  const recent = recentMessages(state, session.id, now);
  if (recent.length >= ROOM_LIMITS.floodMessages) return refused(state, session.id, "flood");
  const recipients = roomMembers(state, command.roomId)
    .filter((member) => member.status === "connected")
    .map((member) => member.id);
  return result(
    { ...state, flood: new Map(state.flood).set(session.id, [...recent, now]) },
    {
      type: "roomMessage",
      roomId: command.roomId,
      authorSessionId: session.id,
      pseudo: session.pseudo,
      gender: session.profile.gender,
      text,
      sentAt: now,
      recipients,
    },
  );
};

/** BR-021: forgets sessions with no message in the window. Called from the hub alarm. */
export const pruneFlood = (state: HubState, now: Date): HubState => {
  const kept = [...state.flood].filter(([sessionId]) => recentMessages(state, sessionId, now).length > 0);
  return kept.length === state.flood.size ? state : { ...state, flood: new Map(kept) };
};
