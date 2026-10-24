import { useEffect, useRef, useState } from "react";
import type { Gender } from "../../shared/protocol";
import { useChat } from "../chat-context";
import { STRINGS } from "../strings";
import { Pseudo } from "./Pseudo";

/** A chatter as the menu needs it: any member, search hit or window partner. */
export interface MenuTarget {
  readonly sessionId: string;
  readonly pseudo: string;
  readonly hasAccount: boolean;
  readonly away: boolean;
  readonly gender?: Gender;
}

/**
 * A clickable pseudo opening "message privé" and "ignorer" (`web-ui/07`). The chatter's own pseudo is plain.
 * "message privé" is greyed when either side has no account (BR-040); while the chatter has none, it opens
 * the account panel instead.
 */
export const PseudoMenu = ({ target }: { target: MenuTarget }) => {
  const { state, commands } = useChat();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const gender = target.gender ?? state.known[target.sessionId];

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (target.sessionId === state.me?.sessionId) return <Pseudo pseudo={target.pseudo} gender={gender} away={target.away} />;

  const signedIn = state.account.accountId !== undefined;
  const ignored = state.ignored.includes(target.sessionId);
  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const privateMessage = () => {
    if (!signedIn) commands.local({ type: "openAccount" });
    else
      commands.local({
        type: "openPrivate",
        other: target.away
          ? { sessionId: target.sessionId, pseudo: target.pseudo, hasAccount: target.hasAccount, away: true }
          : { sessionId: target.sessionId, pseudo: target.pseudo, hasAccount: target.hasAccount, away: false, gender: gender ?? "unspecified" },
      });
  };
  return (
    <span className="pseudo-menu" ref={root}>
      <button
        type="button"
        className="link pseudo-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={STRINGS.pseudoMenu(target.pseudo)}
        onClick={() => setOpen(!open)}
      >
        <Pseudo pseudo={target.pseudo} gender={gender} away={target.away} />
        {ignored && <span className="small"> {STRINGS.ignoredMark}</span>}
      </button>
      {open && (
        <span role="menu" className="menu panel" aria-label={STRINGS.pseudoMenu(target.pseudo)}>
          <button
            ref={first}
            type="button"
            role="menuitem"
            className="link"
            disabled={!target.hasAccount}
            aria-disabled={!signedIn || !target.hasAccount}
            onClick={pick(privateMessage)}
          >
            {STRINGS.privateMessage}
          </button>
          <button
            type="button"
            role="menuitem"
            className="link"
            onClick={pick(() => (ignored ? commands.unignore(target.sessionId) : commands.ignore(target.sessionId)))}
          >
            {ignored ? STRINGS.unignore : STRINGS.ignore}
          </button>
        </span>
      )}
    </span>
  );
};
