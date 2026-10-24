/** Find a chatter by pseudo or city (UC7), study `directory/07-class-domain-api`. A pure read. */
import type { Session } from "./entry";
import { blocks } from "./ignore";
import { foldPseudo } from "./pseudo";
import type { HubState } from "./rooms";

/** UC7 values, tunable here only. */
export const DIRECTORY_LIMITS = {
  minQuery: 2,
  maxResults: 50,
} as const;

/**
 * Sessions whose folded pseudo contains the query, or connected sessions whose folded city equals it, sorted
 * by folded pseudo. Excludes the searcher and anyone it blocks either way (BR-042).
 */
export const search = (state: HubState, sessionId: string, query: string): Session[] => {
  const trimmed = query.trim();
  if ([...trimmed].length < DIRECTORY_LIMITS.minQuery) return [];
  const folded = foldPseudo(trimmed);
  const matches = (session: Session): boolean =>
    foldPseudo(session.pseudo).includes(folded) ||
    (session.status === "connected" && foldPseudo(session.profile.city.trim()) === folded);
  return [...state.sessions.values()]
    .filter((session) => session.id !== sessionId && !blocks(state.ignores, sessionId, session.id) && matches(session))
    .map((session) => ({ session, key: foldPseudo(session.pseudo) }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, DIRECTORY_LIMITS.maxResults)
    .map(({ session }) => session);
};
