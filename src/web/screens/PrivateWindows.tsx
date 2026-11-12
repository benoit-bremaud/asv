import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { hasForbiddenChar } from "../../domain/text";
import { useChat } from "../chat-context";
import { renderText } from "../render";
import { MAX_TEXT, type PrivateView } from "../store";
import { STRINGS } from "../strings";
import { Pseudo } from "./Pseudo";
import { PseudoMenu } from "./PseudoMenu";
import { MESSAGE_FIELD_ID } from "./RoomScreen";


/** Where the focus goes once the store has applied a close or a minimise (`web-ui/07`, #131). */
interface Refocus {
  /** The other session id of the window to focus; none means the room message field. */
  readonly target?: string;
}

type Props = {
  readonly windowKey: string;
  readonly window: PrivateView;
  readonly draft: string;
  readonly setDraft: (text: string) => void;
  /** Called once the close is applied, so the dock can move the focus to a neighbour. */
  readonly onClose: () => void;
  /** Called on minimise, so the dock can move the focus to the new tab. */
  readonly onMinimise: () => void;
};

/** One private window (`web-ui/07`): a non-modal dialog labelled by the other pseudo. */
const PrivateWindow = ({ windowKey, window, draft, setDraft, onClose, onMinimise }: Props) => {
  const { state, commands } = useChat();
  const { other } = window;
  const fieldId = `private-${windowKey}`;
  // BR-020 counts code points; the text stays in the field until it fits.
  const tooLong = [...draft].length > MAX_TEXT;
  // BR-090, checked on the trimmed text as the server does; the draft stays in the field.
  const invisible = hasForbiddenChar(draft.trim());
  // A11Y-03 (#121): the field names what refuses it.
  const describedBy = [tooLong && `${fieldId}-count`, invisible && `${fieldId}-invisible`].filter(Boolean).join(" ") || undefined;
  const gone = window.presence === "gone";
  // A pending window (keyed by the other session id) or a gone partner has nothing to close on the server.
  const close = () => {
    // A refused close keeps the window, and the focus stays on its "×".
    if (commands.closePrivate(windowKey, windowKey !== other.sessionId && !gone)) onClose();
  };
  const minimise = () => {
    onMinimise();
    commands.local({ type: "togglePrivate", conversationId: windowKey });
  };
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (draft.trim() === "" || tooLong || invisible || gone) return;
    if (commands.sendPrivate(other.pseudo, draft)) setDraft("");
  };

  if (window.minimised) {
    return (
      <button type="button" className="bevel private-tab" data-window={other.sessionId} onClick={() => commands.local({ type: "togglePrivate", conversationId: windowKey })}>
        <span className="sr-only">{STRINGS.restore(other.pseudo)}</span>
        <Pseudo pseudo={other.pseudo} gender={other.away ? undefined : other.gender} away={window.presence !== "here"} />
        {window.unread > 0 && <span className="unread"> {STRINGS.unread(window.unread)}</span>}
      </button>
    );
  }

  return (
    <dialog open data-window={other.sessionId} aria-label={STRINGS.privateWith(other.pseudo)} className="private-window panel">
      <header className="private-title">
        <PseudoMenu target={{ ...other, away: window.presence !== "here" }} />
        <span className="private-actions">
          {windowKey !== other.sessionId && (
            <button type="button" className="link icon-button" aria-label={STRINGS.minimise} onClick={minimise}>_</button>
          )}
          <button type="button" className="link icon-button" aria-label={STRINGS.close} onClick={close}>×</button>
        </span>
      </header>
      <ol role="log" aria-live="polite" className="private-lines">
        {/* BR-042: lines already held from a chatter ignored since are hidden, as in rooms. */}
        {window.lines.filter((line) => !state.ignored.includes(line.authorSessionId)).map((line) => (
          <li key={line.id}>
            <Pseudo pseudo={line.pseudo} gender={line.gender} />: {renderText(line.text)}
          </li>
        ))}
        {gone && <li className="small"><Pseudo pseudo={other.pseudo} away /> {STRINGS.otherGone}</li>}
      </ol>
      <form className="composer" onSubmit={submit}>
        <label className="sr-only" htmlFor={fieldId}>{STRINGS.message}</label>
        <input id={fieldId} value={draft} aria-invalid={describedBy ? true : undefined} aria-describedby={describedBy} maxLength={2000} autoComplete="off" disabled={gone} autoFocus onChange={(e) => setDraft(e.target.value)} />
        <span id={`${fieldId}-count`} className={`small${tooLong ? " too-long" : ""}`} aria-live="polite">{[...draft].length}/{MAX_TEXT}</span>
        {invisible && <output id={`${fieldId}-invisible`} className="small too-long">{STRINGS.invisibleChars}</output>}
        <button type="submit" className="bevel primary" disabled={tooLong || invisible || gone}>{STRINGS.send}</button>
      </form>
    </dialog>
  );
};

/** Every private window, docked bottom right on desktop and as a tab bar on phones (`web-ui/07`). */
export const PrivateWindows = () => {
  const { state } = useChat();
  // One draft per chatter, so it survives the pending → conversation key change.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const refocus = useRef<Refocus | undefined>(undefined);
  const entries = Object.entries(state.windows);
  // Runs after every render, so after the store applied the close or minimise asked for.
  useEffect(() => {
    const pending = refocus.current;
    if (!pending) return;
    refocus.current = undefined;
    const target = pending.target === undefined
      ? undefined
      : document.querySelector<HTMLElement>(`button[data-window="${CSS.escape(pending.target)}"], [data-window="${CSS.escape(pending.target)}"] button`);
    (target ?? document.getElementById(MESSAGE_FIELD_ID))?.focus();
  });
  if (entries.length === 0) return null;
  return (
    <aside className="privates" aria-label={STRINGS.privateWindows}>
      {entries.map(([key, window], index) => (
        <PrivateWindow
          key={window.other.sessionId}
          windowKey={key}
          window={window}
          draft={drafts[window.other.sessionId] ?? ""}
          setDraft={(text) => setDrafts((current) => ({ ...current, [window.other.sessionId]: text }))}
          onClose={() => {
            const neighbour = entries[index + 1] ?? entries[index - 1];
            refocus.current = { target: neighbour?.[1].other.sessionId };
          }}
          onMinimise={() => {
            refocus.current = { target: window.other.sessionId };
          }}
        />
      ))}
    </aside>
  );
};
