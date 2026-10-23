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

/** Steps of the account panel (`web-ui/06`). */
export type AccountStep = "signedOut" | "askEmail" | "waitingCode" | "redeemingDevice" | "signedIn" | "confirmDelete";

/** The account panel; the client never holds the e-mail (`web-ui/04`). */
export interface AccountView {
  readonly open: boolean;
  readonly step: AccountStep;
  readonly accountId?: string;
  readonly triesLeft?: number;
  /** A `requestCode` is on its way, so the button waits. */
  readonly pendingRequest: boolean;
  /** A `verifyCode` is on its way, so the code is not sent twice. */
  readonly pendingVerify?: boolean;
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
  readonly account: AccountView;
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
  | { readonly type: "openAccount" }
  | { readonly type: "closeAccount" }
  | { readonly type: "accountStep"; readonly step: AccountStep }
  | { readonly type: "requestingCode" }
  | { readonly type: "verifyingCode" }
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
  account: { open: false, step: "signedOut", pendingRequest: false },
  nextLineId: 0,
};

/** Warnings answering `requestCode` or `verifyCode` (`hub.ts`), and the step each one leads to. */
const ACCOUNT_WARNINGS: Readonly<Record<string, AccountStep>> = {
  emailInvalid: "askEmail",
  disposable: "askEmail",
  rate: "askEmail",
  codeWrong: "waitingCode",
  codeMissing: "askEmail",
  codeExpired: "askEmail",
  codeExhausted: "askEmail",
  blocked: "askEmail",
  gone: "askEmail",
};

const signedOut = (account: AccountView): AccountView => ({ ...account, step: "signedOut", accountId: undefined, triesLeft: undefined, pendingRequest: false });
const linkedTo = (account: AccountView, accountId: string | undefined): AccountView =>
  accountId ? { ...account, step: "signedIn", accountId, triesLeft: undefined } : signedOut(account);

const onWarning = (state: ChatState, code: string, triesLeft: number | undefined): ChatState => {
  const step = ACCOUNT_WARNINGS[code];
  const settled = { ...state.account, pendingRequest: false, pendingVerify: false };
  if (!step) return { ...state, notice: code, account: settled };
  return { ...state, notice: code, account: { ...settled, open: true, step, triesLeft } };
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
        account: linkedTo(state.account, message.payload.accountId),
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
      return { ...state, me, open, known, active, screen, account: linkedTo(state.account, message.payload.accountId) };
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
    case "codeSent":
      return { ...state, notice: "codeSent", account: { ...state.account, open: true, step: "waitingCode", triesLeft: undefined, pendingRequest: false } };
    case "accountLinked": {
      const { accountId, deviceClaim } = message.payload;
      return { ...state, account: { ...state.account, step: deviceClaim ? "redeemingDevice" : "signedIn", accountId, triesLeft: undefined, pendingVerify: false } };
    }
    case "accountUnlinked":
      return { ...state, notice: "accountUnlinked", account: signedOut(state.account) };
    case "warning":
      return onWarning(state, message.payload.code, message.payload.triesLeft);
    case "error":
      // Nothing but `enter` can be sent before `entered`, so an error now answers the pending entry.
      return { ...state, notice: message.payload.code, pendingPseudo: undefined };
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
    case "openAccount":
      return { ...state, account: { ...state.account, open: true, step: state.account.step === "signedOut" ? "askEmail" : state.account.step } };
    case "closeAccount":
      return { ...state, account: { ...state.account, open: false } };
    case "accountStep":
      return { ...state, account: action.step === "signedOut" ? signedOut(state.account) : { ...state.account, step: action.step } };
    case "verifyingCode":
      return { ...state, account: { ...state.account, pendingVerify: true } };
    case "requestingCode":
      return { ...state, account: { ...state.account, open: true, step: "askEmail", pendingRequest: true } };
  }
};
