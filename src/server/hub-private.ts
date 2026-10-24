/**
 * Brick 6 commands of the hub (`platform/04c`): private conversations, ignore and search, plus the private
 * presence sent on socket loss and resume. A private message is logged before anything is kept or sent
 * (BR-060).
 */
import {
  closePrivate,
  ignore,
  openPartners,
  otherSide,
  search,
  sendPrivate,
  unignore,
  windowsOf,
  type BufferedMessage,
  type ConnectionLogStore,
  type HubState,
  type PrivateResult,
  type Random,
  type Session,
} from "../domain";
import type { ClientMessage } from "../shared/protocol";
import { sessionOf, toMember, toOther, type Outgoing, type OutgoingModule, type Payload } from "./outgoing";

type Command<T extends ClientMessage["type"]> = Extract<ClientMessage, { type: T }>;

/** The socket asking, with the id of its connection line. */
export interface PrivateCaller {
  readonly key: string;
  readonly sessionId: string;
  readonly connectionId: string;
}

/** The hub dependencies the private commands use (the subset of `HubDeps`). */
export interface PrivateDeps {
  readonly random: Random;
  readonly log: ConnectionLogStore;
  readonly protocols: string;
  readonly onLogError: (error: unknown) => void;
}

/** What the private handlers share with the hub. */
export interface PrivateContext {
  readonly deps: PrivateDeps;
  readonly out: OutgoingModule;
  state(): HubState;
  setState(next: HubState): void;
}

type PrivateHandler<T extends ClientMessage["type"]> = (caller: PrivateCaller, command: Command<T>, now: Date) => Promise<Outgoing[]>;

/** One handler per brick 6 command, plus the presence helpers `wentAway` and `resumedWindows`. */
export const createPrivateHandlers = (ctx: PrivateContext) => {
  const { deps, out } = ctx;

  const commit = (result: PrivateResult, replyTo: number): Outgoing[] => {
    ctx.setState(result.state);
    return out.roomOutgoing(result.effects, replyTo);
  };

  /** UC6 (`private-conversations/02`). */
  const onSendPrivate: PrivateHandler<"sendPrivate"> = async (caller, command, now) => {
    const { targetPseudo, text } = command.payload;
    const result = sendPrivate(ctx.state(), { sessionId: caller.sessionId, targetPseudo, text }, now, deps.random);
    if (result.effects.some((effect) => effect.type === "privateMessage")) {
      try {
        await deps.log.appendContribution({ connectionId: caller.connectionId, protocols: deps.protocols, at: now });
      } catch (cause) {
        deps.onLogError(cause);
        return [out.error(caller.key, "logUnavailable", command.seq)];
      }
    }
    return commit(result, command.seq);
  };

  /** D1: nothing is sent back, the client already closed the window. */
  const onClosePrivate: PrivateHandler<"closePrivate"> = (caller, command) =>
    Promise.resolve(commit(closePrivate(ctx.state(), caller.sessionId, command.payload.conversationId), command.seq));

  const onIgnore: PrivateHandler<"ignore"> = (caller, command) =>
    Promise.resolve(commit(ignore(ctx.state(), caller.sessionId, command.payload.targetSessionId), command.seq));

  const onUnignore: PrivateHandler<"unignore"> = (caller, command) =>
    Promise.resolve(commit(unignore(ctx.state(), caller.sessionId, command.payload.targetSessionId), command.seq));

  /** UC7: a read, nothing kept and nothing logged (`directory/07`). */
  const onSearch: PrivateHandler<"search"> = (caller, command) => {
    const results = search(ctx.state(), caller.sessionId, command.payload.query).map((session) => ({
      ...toMember(session),
      rooms: [...session.rooms],
    }));
    return Promise.resolve([out.send([caller.key], "searchResults", { results })]);
  };

  /** Socket lost: `memberAway` without `roomId` to the open partners (`web-ui/07` OtherAway). */
  const wentAway = (session: Session): Outgoing[] => {
    const to = out.keysOf(openPartners(ctx.state(), session.id).map(({ partner }) => partner));
    return to.length > 0 ? [out.send(to, "memberAway", { sessionId: session.id, pseudo: session.pseudo })] : [];
  };

  /**
   * Resume (BR-013): the session's open windows and its buffered messages for the `resumed` payload, and a
   * `privateWindow` to each open partner so it shows the chatter back.
   */
  const resumedWindows = (session: Session, buffered: readonly BufferedMessage[]) => {
    const state = ctx.state();
    const windows: Payload<"resumed">["windows"] = windowsOf(state, session.id).map((conversation) => ({
      conversationId: conversation.id,
      other: toOther(sessionOf(state, otherSide(conversation, session.id))),
    }));
    // A conversation closed meanwhile (its author left) drops its buffered lines.
    const open = new Set(windows.map((window) => window.conversationId));
    const messages: Payload<"resumed">["buffered"] = buffered.filter((message) => open.has(message.conversationId)).map((message) => ({
      conversationId: message.conversationId,
      authorSessionId: message.authorSessionId,
      text: message.text,
      sentAt: message.sentAt.toISOString(),
    }));
    const back = openPartners(state, session.id).flatMap(({ conversationId, partner }) =>
      out.keysOf([partner]).map((key) => out.send([key], "privateWindow", { conversationId, other: toOther(session) })));
    return { windows, buffered: messages, back };
  };

  return {
    sendPrivate: onSendPrivate,
    closePrivate: onClosePrivate,
    ignore: onIgnore,
    unignore: onUnignore,
    search: onSearch,
    wentAway,
    resumedWindows,
  };
};
