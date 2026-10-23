/**
 * Client state (`web-ui/04`, owner choice D6): one pure reducer over server messages and local actions.
 * Nothing here is stored in the browser except by the connection manager.
 */
import type { Gender, Member, ServerMessage } from "../shared/protocol";

/** The screen shown (`web-ui/03`). */
export type Screen = "entry" | "rooms" | "room";
/** Socket state shown in the banner: `reconnecting` while a saved session waits to resume. */
export type Link = "offline" | "online" | "reconnecting";
type RoomSummary = Extract<ServerMessage, { type: "roomList" }>["payload"]["rooms"][number];

/** One room line, memory only (BR-034). */
export interface Line {
  readonly id: number;
  readonly authorSessionId: string;
  readonly pseudo: string;
  readonly gender: Gender;
  readonly text: string;
  readonly sentAt: string;
}

/** A room the user has joined: its members and newest lines. */
export interface OpenRoom {
  readonly members: readonly Member[];
  readonly lines: readonly Line[];
}

/** Everything the screens render; `notice` and `entryError` are codes the screens translate. */
export interface ChatState {
  readonly screen: Screen;
  readonly link: Link;
  readonly me?: { readonly sessionId: string; readonly pseudo: string };
  /** Pseudo sent with `enter`, until `entered` confirms it. */
  readonly pendingPseudo?: string;
  /** Prefilled on the entry screen after a refused resume or a leave (`entry/02b`). */
  readonly lastPseudo?: string;
  readonly roomList: readonly RoomSummary[];
  readonly open: Readonly<Record<string, OpenRoom>>;
  readonly active?: string;
  /** Last gender seen per session, to colour away pseudos (issue #21). Memory only. */
  readonly known: Readonly<Record<string, Gender>>;
  readonly notice?: string;
  readonly entryError?: string;
  /** Monotonic key for `Line.id`, never reused. */
  readonly nextLineId: number;
}

/** Server messages and local actions the reducer handles. */
export type Action =
  | { readonly type: "server"; readonly message: ServerMessage }
  | { readonly type: "link"; readonly link: Link }
  | { readonly type: "entering"; readonly pseudo: string }
  | { readonly type: "left" }
  | { readonly type: "showRooms" }
  | { readonly type: "showRoom"; readonly roomId: string }
  | { readonly type: "closeRoom"; readonly roomId: string }
  | { readonly type: "notice"; readonly code: string }
  | { readonly type: "dismissNotice" };

/** BR-034: only the newest lines stay in memory, nothing is kept elsewhere. */
export const MAX_LINES = 200;

/** State before any socket opens: entry screen, offline. */
export const initialState: ChatState = {
  screen: "entry",
  link: "offline",
  roomList: [],
  open: {},
  known: {},
  nextLineId: 0,
};

const learn = (known: ChatState["known"], members: readonly Member[]): ChatState["known"] => {
  const next = { ...known };
  for (const member of members) if (!member.away) next[member.sessionId] = member.gender;
  return next;
};

const withRoom = (state: ChatState, roomId: string, update: (room: OpenRoom) => OpenRoom): ChatState => {
  const room = state.open[roomId];
  return room ? { ...state, open: { ...state.open, [roomId]: update(room) } } : state;
};

const replaceMember = (members: readonly Member[], member: Member): Member[] => {
  const others = members.filter((other) => other.sessionId !== member.sessionId);
  return [...others, member];
};

/** After a room closes: next open room, else the list. */
const afterClose = (state: ChatState, open: ChatState["open"]): ChatState => {
  const [next] = Object.keys(open);
  return { ...state, open, active: next, screen: next ? "room" : "rooms" };
};

const onServer = (state: ChatState, message: ServerMessage): ChatState => {
  switch (message.type) {
    case "entered":
      return {
        ...state,
        screen: "rooms",
        me: { sessionId: message.payload.sessionId, pseudo: state.pendingPseudo ?? "" },
        pendingPseudo: undefined,
        entryError: undefined,
        roomList: message.payload.roomList,
      };
    case "entryRefused":
      return { ...state, pendingPseudo: undefined, entryError: message.payload.reason };
    case "resumed": {
      const open: Record<string, OpenRoom> = {};
      let known = state.known;
      for (const room of message.payload.rooms) {
        open[room.roomId] = { members: room.members, lines: state.open[room.roomId]?.lines ?? [] };
        known = learn(known, room.members);
      }
      const active = state.active && open[state.active] ? state.active : Object.keys(open)[0];
      const screen = state.screen === "room" && active ? "room" : "rooms";
      const me = { sessionId: message.payload.sessionId, pseudo: message.payload.pseudo };
      return { ...state, me, open, known, active, screen };
    }
    case "resumeRefused":
      return { ...initialState, link: state.link, lastPseudo: state.me?.pseudo };
    case "roomList":
      return { ...state, roomList: message.payload.rooms };
    case "roomJoined": {
      const { roomId, members } = message.payload;
      return {
        ...state,
        open: { ...state.open, [roomId]: { members, lines: state.open[roomId]?.lines ?? [] } },
        known: learn(state.known, members),
        active: roomId,
        screen: "room",
      };
    }
    case "memberJoined":
    case "memberBack": {
      const { roomId, member } = message.payload;
      const next = withRoom(state, roomId, (room) => ({ ...room, members: replaceMember(room.members, member) }));
      return { ...next, known: learn(next.known, [member]) };
    }
    case "memberLeft": {
      const { roomId, sessionId } = message.payload;
      if (!roomId) return state;
      return withRoom(state, roomId, (room) => ({
        ...room,
        members: room.members.filter((member) => member.sessionId !== sessionId),
      }));
    }
    case "memberAway": {
      const { roomId, sessionId, pseudo } = message.payload;
      if (!roomId) return state;
      return withRoom(state, roomId, (room) => ({
        ...room,
        members: room.members.map((member) =>
          member.sessionId === sessionId ? { sessionId, pseudo, away: true } : member,
        ),
      }));
    }
    case "roomMessage": {
      const { roomId, authorSessionId, pseudo, gender, text, sentAt } = message.payload;
      const line: Line = { id: state.nextLineId, authorSessionId, pseudo, gender, text, sentAt };
      const next = withRoom(state, roomId, (room) => ({ ...room, lines: [...room.lines, line].slice(-MAX_LINES) }));
      return { ...next, nextLineId: state.nextLineId + 1 };
    }
    case "warning":
    case "error":
      return { ...state, notice: message.payload.code };
    default:
      return state;
  }
};

/** The client reducer: pure, so screens and tests share one behaviour. */
export const chatReducer = (state: ChatState, action: Action): ChatState => {
  switch (action.type) {
    case "server":
      return onServer(state, action.message);
    case "link":
      // A lost socket drops a pending entry: the server never answered it.
      return action.link === "online" ? { ...state, link: action.link } : { ...state, link: action.link, pendingPseudo: undefined };
    case "entering":
      return { ...state, pendingPseudo: action.pseudo, entryError: undefined };
    case "left":
      return { ...initialState, link: state.link, lastPseudo: state.me?.pseudo };
    case "showRooms":
      return { ...state, screen: "rooms" };
    case "showRoom":
      return state.open[action.roomId] ? { ...state, screen: "room", active: action.roomId } : state;
    case "closeRoom": {
      const open = Object.fromEntries(Object.entries(state.open).filter(([roomId]) => roomId !== action.roomId));
      return state.active === action.roomId ? afterClose(state, open) : { ...state, open };
    }
    case "notice":
      return { ...state, notice: action.code };
    case "dismissNotice":
      return { ...state, notice: undefined };
  }
};
