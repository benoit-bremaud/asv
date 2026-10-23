/**
 * Session close on the whole hub state (`rooms/07`, D6): the entry functions, then room cleanup.
 * `index.ts` exports these in place of the entry `leave` and `expireAway`.
 */
import { expireAway as expireEntry, leave as leaveEntry, type Effect, type Session } from "./entry";
import { vacateRooms, type HubState, type RoomEffect } from "./rooms";

/** Hub-wide result: entry effects first, then room effects. */
export interface HubResult {
  readonly state: HubState;
  readonly effects: readonly (Effect | RoomEffect)[];
}

/** Leaves every room of the closed sessions, then forgets their flood counters. */
const closeRooms = (state: HubState, closed: readonly Session[], effects: readonly Effect[]): HubResult => {
  // One copy for the whole close, each closed session deleted from it.
  const flood = new Map(state.flood);
  return closed.reduce<HubResult>(
    (acc, session) => {
      flood.delete(session.id);
      const vacated = vacateRooms(acc.state, session, session.rooms);
      return { state: { ...vacated.state, flood }, effects: [...acc.effects, ...vacated.effects] };
    },
    { state, effects },
  );
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
