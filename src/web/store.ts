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
/** The other chatter of a private window: a member without age and city. */
export type OtherChatter = Extract<ServerMessage, { type: "privateWindow" }>["payload"]["other"];
/** One search hit (UC7): a member and the rooms it is in. */
export type SearchResult = Extract<ServerMessage, { type: "searchResults" }>["payload"]["results"][number];

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

/** One private window (`web-ui/07`), memory only (BR-034). */
export interface PrivateView {
  readonly other: OtherChatter;
  readonly lines: readonly Line[];
  readonly minimised: boolean;
  readonly unread: number;
  readonly presence: "here" | "away" | "gone";
}

/** The search panel (UC7). */
export interface SearchView {
  readonly query: string;
  readonly pending: boolean;
  readonly results: readonly SearchResult[];
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
  /** Keyed by conversation id; a window opened before its first message is keyed by the other session id. */
  readonly windows: Readonly<Record<string, PrivateView>>;
  readonly ignored: readonly string[];
  readonly search: SearchView;
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
  | { readonly type: "dismissNotice" }
  | { readonly type: "openPrivate"; readonly other: OtherChatter }
  | { readonly type: "closePrivate"; readonly conversationId: string }
  | { readonly type: "togglePrivate"; readonly conversationId: string }
  | { readonly type: "searching"; readonly query: string }
  | { readonly type: "clearSearch" };

/** BR-034: only the newest lines stay in memory, nothing is kept elsewhere. */
export const MAX_LINES = 200;
/** BR-020: the server cap, mirrored so composers count code points before sending. */
export const MAX_TEXT = 500;

/** State before any socket opens: entry screen, offline. */
export const initialState: ChatState = {
  screen: "entry",
  link: "offline",
  roomList: [],
  open: {},
  known: {},
  account: { open: false, step: "signedOut", pendingRequest: false },
  windows: {},
  ignored: [],
  search: { query: "", pending: false, results: [] },
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

type PrivateMessage = Extract<ServerMessage, { type: "privateMessage" }>["payload"];

/** A private line: the author is either me or the window's other chatter. */
const privateLine = (state: ChatState, window: PrivateView, message: PrivateMessage, id: number): Line => {
  const mine = message.authorSessionId === state.me?.sessionId;
  const other = window.other;
  return {
    id,
    authorSessionId: message.authorSessionId,
    pseudo: mine ? (state.me?.pseudo ?? "") : other.pseudo,
    gender: mine ? (state.me ? (state.known[state.me.sessionId] ?? "unspecified") : "unspecified") : other.away ? (state.known[other.sessionId] ?? "unspecified") : other.gender,
    text: message.text,
    sentAt: message.sentAt,
  };
};

const appendPrivate = (state: ChatState, message: PrivateMessage, countUnread: boolean): ChatState => {
  const window = state.windows[message.conversationId];
  // BR-042: a line still held from an ignored chatter is not shown.
  if (!window || state.ignored.includes(message.authorSessionId)) return state;
  const line = privateLine(state, window, message, state.nextLineId);
  const unread = countUnread && window.minimised ? window.unread + 1 : window.unread;
  return {
    ...state,
    windows: { ...state.windows, [message.conversationId]: { ...window, lines: [...window.lines, line].slice(-MAX_LINES), unread } },
    nextLineId: state.nextLineId + 1,
  };
};

/** Presence of every window with that chatter (`memberAway` / `memberLeft` without `roomId`). */
const withPresence = (state: ChatState, sessionId: string, presence: PrivateView["presence"]): ChatState => ({
  ...state,
  windows: Object.fromEntries(Object.entries(state.windows).map(([id, window]) =>
    [id, window.other.sessionId === sessionId ? { ...window, presence } : window])),
});

const onPrivateWindow = (state: ChatState, conversationId: string, other: OtherChatter): ChatState => {
  // The pending window opened by `openPrivate` takes its conversation id.
  const { [other.sessionId]: pending, ...rest } = state.windows;
  const current = state.windows[conversationId] ?? pending;
  const window: PrivateView = current
    ? { ...current, other, presence: other.away ? "away" : "here" }
    : { other, lines: [], minimised: false, unread: 0, presence: other.away ? "away" : "here" };
  const known = other.away ? state.known : { ...state.known, [other.sessionId]: other.gender };
  return { ...state, known, windows: { ...(pending ? rest : state.windows), [conversationId]: window } };
};

const onResumedWindows = (state: ChatState, payload: Extract<ServerMessage, { type: "resumed" }>["payload"]): ChatState => {
  const windows: Record<string, PrivateView> = {};
  for (const { conversationId, other } of payload.windows) {
    const lines = state.windows[conversationId]?.lines ?? [];
    windows[conversationId] = { other, lines, minimised: true, unread: 0, presence: other.away ? "away" : "here" };
  }
  return payload.buffered.reduce((acc, message) => appendPrivate(acc, message, true), { ...state, windows });
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
      const next: ChatState = { ...state, me, open, known, active, screen, account: linkedTo(state.account, message.payload.accountId) };
      return onResumedWindows(next, message.payload);
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
      if (!roomId) return withPresence(state, sessionId, "gone");
      return withRoom(state, roomId, (room) => ({
        ...room,
        members: room.members.filter((member) => member.sessionId !== sessionId),
      }));
    }
    case "memberAway": {
      const { roomId, sessionId, pseudo } = message.payload;
      if (!roomId) return withPresence(state, sessionId, "away");
      return withRoom(state, roomId, (room) => ({
        ...room,
        members: room.members.map((member) =>
          member.sessionId === sessionId ? { sessionId, pseudo, hasAccount: member.hasAccount, away: true } : member,
        ),
      }));
    }
    case "roomMessage": {
      const { roomId, authorSessionId, pseudo, gender, text, sentAt } = message.payload;
      const line: Line = { id: state.nextLineId, authorSessionId, pseudo, gender, text, sentAt };
      const next = withRoom(state, roomId, (room) => ({ ...room, lines: [...room.lines, line].slice(-MAX_LINES) }));
      return { ...next, nextLineId: state.nextLineId + 1 };
    }
    case "privateWindow":
      return onPrivateWindow(state, message.payload.conversationId, message.payload.other);
    case "privateMessage":
      return appendPrivate(state, message.payload, true);
    case "ignoreUpdated":
      return { ...state, ignored: message.payload.ignored };
    case "searchResults":
      return { ...state, search: { ...state.search, pending: false, results: message.payload.results } };
    case "codeSent":
      return { ...state, notice: "codeSent", account: { ...state.account, open: true, step: "waitingCode", triesLeft: undefined, pendingRequest: false } };
    case "accountLinked": {
      const { accountId, deviceClaim } = message.payload;
      return { ...state, account: { ...state.account, step: deviceClaim ? "redeemingDevice" : "signedIn", accountId, triesLeft: undefined, pendingVerify: false } };
    }
    case "accountUnlinked":
      // ASV-F-024: the server already closed every conversation.
      return { ...state, notice: "accountUnlinked", account: signedOut(state.account), windows: {} };
    case "warning":
      return onWarning(state, message.payload.code, message.payload.triesLeft);
    case "error":
      // Nothing but `enter` can be sent before `entered`, so an error now answers the pending entry.
      if (message.payload.code === "accountRequired" && state.account.step === "signedOut") {
        // `web-ui/07`: a chatter without an account is offered one.
        return { ...state, notice: "accountRequired", account: { ...state.account, open: true, step: "askEmail" } };
      }
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
    case "openPrivate": {
      const existing = Object.entries(state.windows).find(([, window]) => window.other.sessionId === action.other.sessionId);
      if (existing) {
        const [id, window] = existing;
        return { ...state, windows: { ...state.windows, [id]: { ...window, minimised: false, unread: 0 } } };
      }
      const window: PrivateView = { other: action.other, lines: [], minimised: false, unread: 0, presence: action.other.away ? "away" : "here" };
      return { ...state, windows: { ...state.windows, [action.other.sessionId]: window } };
    }
    case "closePrivate":
      return { ...state, windows: Object.fromEntries(Object.entries(state.windows).filter(([id]) => id !== action.conversationId)) };
    case "togglePrivate": {
      const window = state.windows[action.conversationId];
      if (!window) return state;
      const minimised = !window.minimised;
      return { ...state, windows: { ...state.windows, [action.conversationId]: { ...window, minimised, unread: minimised ? window.unread : 0 } } };
    }
    case "searching":
      return { ...state, search: { ...state.search, query: action.query, pending: true } };
    case "clearSearch":
      return { ...state, search: initialState.search };
  }
};
