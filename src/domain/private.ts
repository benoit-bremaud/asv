/**
 * Private conversations and ignore (UC6, UC8), study `private-conversations/07-class-domain-api`.
 * Every function is pure: `(state, command, now, random) → { state, effects }`.
 */
import { bufferPrivate, type Random, type Session } from "./entry";
import { blocks } from "./ignore";
import { foldPseudo } from "./pseudo";
import { countMessage, ROOM_LIMITS, type HubState } from "./rooms";

/** V1 values of BR-043 and BR-044, tunable here only. */
export const PRIVATE_LIMITS = {
  maxWindows: 3,
  maxIgnored: 100,
} as const;

/** One conversation between two sessions; `openFor` lists the sides whose window is open (D1). */
export interface PrivateConversation {
  readonly id: string;
  readonly first: string;
  readonly second: string;
  readonly openFor: readonly string[];
}

/** UC6 form. Raw strings are bounded by the protocol layer (#13). */
export interface SendPrivateCommand {
  readonly sessionId: string;
  readonly targetPseudo: string;
  readonly text: string;
}

/** `accountRequired` and `offline` map to the protocol `error`, the others to `warning`. */
export type PrivateRefusal = "accountRequired" | "offline" | "self" | "empty" | "tooLong" | "flood" | "tooManyWindows" | "targetBusy";

/** What the hub must send (`platform/04c`). */
export type PrivateEffect =
  | { readonly type: "privateRefused"; readonly sessionId: string; readonly reason: PrivateRefusal }
  | { readonly type: "privateWindowOpened"; readonly sessionId: string; readonly conversationId: string; readonly otherSessionId: string }
  | {
      readonly type: "privateMessage";
      readonly conversationId: string;
      readonly authorSessionId: string;
      readonly text: string;
      readonly sentAt: Date;
      /** Connected sessions to send it to, author included (echo). */
      readonly recipients: readonly string[];
    }
  | { readonly type: "ignoreUpdated"; readonly sessionId: string; readonly ignored: readonly string[] }
  | { readonly type: "partnerLeft"; readonly sessionId: string; readonly pseudo: string; readonly recipients: readonly string[] };

/** Output of every private function. */
export interface PrivateResult {
  readonly state: HubState;
  readonly effects: readonly PrivateEffect[];
}

const result = (state: HubState, ...effects: PrivateEffect[]): PrivateResult => ({ state, effects });

/** The other session of a conversation. */
export const otherSide = (conversation: PrivateConversation, sessionId: string): string =>
  conversation.first === sessionId ? conversation.second : conversation.first;

const between = (state: HubState, a: string, b: string): PrivateConversation | undefined =>
  [...state.conversations.values()].find(
    (conversation) => (conversation.first === a && conversation.second === b) || (conversation.first === b && conversation.second === a),
  );

/**
 * Connected partners whose window on a conversation with the session is open, minus the ones either side
 * ignores (BR-042): they get the session's presence without `roomId`.
 */
export const openPartners = (state: HubState, sessionId: string): { conversationId: string; partner: string }[] =>
  [...state.conversations.values()].flatMap((conversation) => {
    if (conversation.first !== sessionId && conversation.second !== sessionId) return [];
    const partner = otherSide(conversation, sessionId);
    const open = conversation.openFor.includes(partner) && state.sessions.get(partner)?.status === "connected";
    return open && !blocks(state.ignores, sessionId, partner) ? [{ conversationId: conversation.id, partner }] : [];
  });

/** Conversations whose window is open for the session, in opening order. */
export const windowsOf = (state: HubState, sessionId: string): PrivateConversation[] =>
  [...state.conversations.values()].filter((conversation) => conversation.openFor.includes(sessionId));

/** BR-043: the window is already open for the session, or it still has room for one more. */
const hasRoom = (state: HubState, existing: PrivateConversation | undefined, sessionId: string): boolean =>
  (existing?.openFor.includes(sessionId) ?? false) || windowsOf(state, sessionId).length < PRIVATE_LIMITS.maxWindows;

/** BR-020: a trimmed text is refused when empty or too long, counted in characters (code points), not UTF-16 units. */
const textRefusal = (text: string): PrivateRefusal | undefined => {
  if (text.length === 0) return "empty";
  return [...text].length > ROOM_LIMITS.maxTextLength ? "tooLong" : undefined;
};

/** UC6, BR-013, BR-020, BR-021, BR-040 to BR-043. */
export const sendPrivate = (state: HubState, command: SendPrivateCommand, now: Date, random: Random): PrivateResult => {
  const sender = state.sessions.get(command.sessionId);
  if (sender?.status !== "connected") return result(state);
  const refuse = (reason: PrivateRefusal) => result(state, { type: "privateRefused", sessionId: sender.id, reason });
  if (!sender.accountId) return refuse("accountRequired");
  const targetId = state.pseudoIndex.get(foldPseudo(command.targetPseudo.trim()));
  const target = targetId === undefined ? undefined : state.sessions.get(targetId);
  if (!target) return refuse("offline");
  if (target.id === sender.id) return refuse("self");
  if (!target.accountId) return refuse("accountRequired");
  const text = command.text.trim();
  const badText = textRefusal(text);
  if (badText) return refuse(badText);
  const counted = countMessage(state, sender.id, now);
  if (!counted) return refuse("flood");
  const existing = between(state, sender.id, target.id);
  if (!hasRoom(state, existing, sender.id)) return refuse("tooManyWindows");
  // BR-043 (owner choice C): nobody can force windows open past the target's cap; checked before the ignore
  // test so it reveals no block.
  if (!hasRoom(state, existing, target.id)) return refuse("targetBusy");

  const id = existing?.id ?? random.id();
  const openFor = new Set(existing?.openFor);
  const effects: PrivateEffect[] = [];
  const open = (side: string, other: string) => {
    if (!openFor.has(side)) effects.push({ type: "privateWindowOpened", sessionId: side, conversationId: id, otherSessionId: other });
    openFor.add(side);
  };
  open(sender.id, target.id);
  let next = counted;
  const recipients = [sender.id];
  // BR-041, BR-042: dropped for the target, the sender still sees its echo.
  if (!blocks(state.ignores, sender.id, target.id)) {
    if (target.status === "away") {
      next = bufferPrivate(next, target.id, { conversationId: id, authorSessionId: sender.id, text, sentAt: now }).state;
      // Comes back in `resumed.windows`, so no effect now.
      openFor.add(target.id);
    } else {
      open(target.id, sender.id);
      recipients.push(target.id);
    }
  }
  const conversation: PrivateConversation = existing
    ? { ...existing, openFor: [...openFor] }
    : { id, first: sender.id, second: target.id, openFor: [...openFor] };
  effects.push({ type: "privateMessage", conversationId: id, authorSessionId: sender.id, text, sentAt: now, recipients });
  return result({ ...next, conversations: new Map(next.conversations).set(id, conversation) }, ...effects);
};

/** D1, BR-043: closes the caller's window; the other side is not told. */
export const closePrivate = (state: HubState, sessionId: string, conversationId: string): PrivateResult => {
  const conversation = state.conversations.get(conversationId);
  if (!conversation?.openFor.includes(sessionId)) return result(state);
  const openFor = conversation.openFor.filter((side) => side !== sessionId);
  const conversations = new Map(state.conversations);
  if (openFor.length === 0) conversations.delete(conversationId);
  else conversations.set(conversationId, { ...conversation, openFor });
  return result({ ...state, conversations });
};

const updated = (state: HubState, sessionId: string, ignored: readonly string[]): PrivateResult =>
  result({ ...state, ignores: new Map(state.ignores).set(sessionId, ignored) }, { type: "ignoreUpdated", sessionId, ignored });

/** UC8, BR-042, BR-044: the target must be another session of the hub. */
export const ignore = (state: HubState, sessionId: string, targetSessionId: string): PrivateResult => {
  if (!state.sessions.has(sessionId) || !state.sessions.has(targetSessionId) || sessionId === targetSessionId) return result(state);
  const ignored = state.ignores.get(sessionId) ?? [];
  if (ignored.includes(targetSessionId)) return updated(state, sessionId, ignored);
  if (ignored.length >= PRIVATE_LIMITS.maxIgnored) return result(state);
  return updated(state, sessionId, [...ignored, targetSessionId]);
};

/** UC8 alternative: removes the ignore during the same session. */
export const unignore = (state: HubState, sessionId: string, targetSessionId: string): PrivateResult => {
  if (!state.sessions.has(sessionId)) return result(state);
  const ignored = (state.ignores.get(sessionId) ?? []).filter((id) => id !== targetSessionId);
  return updated(state, sessionId, ignored);
};

/**
 * Session close or account unlink: deletes the sessions' conversations. With `notify` (session close), the
 * connected partners whose window was open get `partnerLeft`; an unlink tells nobody.
 */
export const closeConversations = (
  state: HubState,
  closed: readonly Pick<Session, "id" | "pseudo">[],
  notify: boolean,
): PrivateResult => {
  const ids = new Set(closed.map((session) => session.id));
  const conversations = new Map(state.conversations);
  const told = new Map<string, string[]>();
  for (const conversation of state.conversations.values()) {
    const side = [conversation.first, conversation.second].find((id) => ids.has(id));
    if (side === undefined) continue;
    conversations.delete(conversation.id);
    const partner = otherSide(conversation, side);
    const partnerSession = state.sessions.get(partner);
    // BR-042: an ignored chatter never learns the other left.
    const open = partnerSession?.status === "connected" && conversation.openFor.includes(partner);
    if (notify && !ids.has(partner) && open && !blocks(state.ignores, side, partner)) {
      told.set(side, [...(told.get(side) ?? []), partner]);
    }
  }
  const effects = closed
    .filter((session) => told.has(session.id))
    .map((session): PrivateEffect => ({ type: "partnerLeft", sessionId: session.id, pseudo: session.pseudo, recipients: told.get(session.id) ?? [] }));
  return result({ ...state, conversations }, ...effects);
};

/** Session close: forgets the closed sessions' ignore lists and drops their ids from the other lists. */
export const forgetIgnores = (state: HubState, closed: ReadonlySet<string>): HubState => {
  if (state.ignores.size === 0) return state;
  const ignores = new Map(
    [...state.ignores]
      .filter(([owner]) => !closed.has(owner))
      .map(([owner, ignored]) => [owner, ignored.filter((id) => !closed.has(id))] as const),
  );
  return { ...state, ignores };
};
