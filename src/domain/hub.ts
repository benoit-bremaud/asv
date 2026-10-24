/**
 * Session close on the whole hub state (`rooms/07`, D6): the entry functions, then room cleanup.
 * `index.ts` exports these in place of the entry `leave` and `expireAway`.
 */
import { unlinkSessions as unlinkAccounts, type SessionFilter } from "./accounts";
import {
  expireAway as expireEntry,
  leave as leaveEntry,
  resume as resumeEntry,
  type Effect,
  type Random,
  type ResumeCommand,
  type Session,
} from "./entry";
import { closeConversations, forgetIgnores, type PrivateEffect } from "./private";
import { vacateRooms, type HubState, type RoomEffect } from "./rooms";

/** Hub-wide result: entry effects first, then room effects, then private effects. */
export interface HubResult {
  readonly state: HubState;
  readonly effects: readonly (Effect | RoomEffect | PrivateEffect)[];
}

/** Leaves every room of the closed sessions, closes their conversations, then forgets their counters and ignores. */
const closeRooms = (state: HubState, closed: readonly Session[], effects: readonly Effect[]): HubResult => {
  // One copy for the whole close, each closed session deleted from it.
  const flood = new Map(state.flood);
  const left = closed.reduce<HubResult>(
    (acc, session) => {
      flood.delete(session.id);
      const vacated = vacateRooms(acc.state, session, session.rooms);
      return { state: { ...vacated.state, flood }, effects: [...acc.effects, ...vacated.effects] };
    },
    { state, effects },
  );
  if (closed.length === 0) return left;
  const conversations = closeConversations(left.state, closed, true);
  const ids = new Set(closed.map((session) => session.id));
  return { state: forgetIgnores(conversations.state, ids), effects: [...left.effects, ...conversations.effects] };
};

/** ASV-F-024 on the hub: a resume whose account is gone also closes its conversations, silently. */
export const resume = (state: HubState, command: ResumeCommand, now: Date, random: Random): HubResult => {
  const resumed = resumeEntry(state, command, now, random);
  const effect = resumed.effects.find((candidate) => candidate.type === "resumed");
  if (effect?.type !== "resumed" || !effect.accountUnlinked) return resumed;
  const session = resumed.state.sessions.get(effect.sessionId);
  if (!session) return resumed;
  return { state: closeConversations(resumed.state, [session], false).state, effects: resumed.effects };
};

/** ASV-F-024: unlinks the matching sessions and closes their conversations without telling the partners. */
export const unlinkSessions = (state: HubState, filter: SessionFilter): { state: HubState; unlinked: string[] } => {
  const result = unlinkAccounts(state, filter);
  const sessions = result.unlinked.flatMap((id) => {
    const session = result.state.sessions.get(id);
    return session ? [session] : [];
  });
  return { state: closeConversations(result.state, sessions, false).state, unlinked: result.unlinked };
};

/** Sessions present before and gone after: the ones the entry function closed. */
const closedSessions = (before: HubState, after: HubState): Session[] =>
  [...before.sessions.values()].filter((session) => !after.sessions.has(session.id));

/** UC10 on the hub: closes the session and leaves its rooms. */
export const leave = (state: HubState, sessionId: string): HubResult => {
  const closed = leaveEntry(state, sessionId);
  return closeRooms(closed.state, closedSessions(state, closed.state), closed.effects);
};

/** BR-015 on the hub: closes expired away sessions and leaves their rooms. */
export const expireAway = (state: HubState, now: Date): HubResult => {
  const closed = expireEntry(state, now);
  return closeRooms(closed.state, closedSessions(state, closed.state), closed.effects);
};
