import { useState, type SubmitEvent } from "react";
import { useChat } from "../chat-context";
import { renderText } from "../render";
import { MAX_TEXT, type PrivateView } from "../store";
import { STRINGS } from "../strings";
import { Pseudo } from "./Pseudo";
import { PseudoMenu } from "./PseudoMenu";


type Props = { readonly windowKey: string; readonly window: PrivateView; readonly draft: string; readonly setDraft: (text: string) => void };

/** One private window (`web-ui/07`): a non-modal dialog labelled by the other pseudo. */
const PrivateWindow = ({ windowKey, window, draft, setDraft }: Props) => {
  const { state, commands } = useChat();
  const { other } = window;
  const fieldId = `private-${windowKey}`;
  // BR-020 counts code points; the text stays in the field until it fits.
  const tooLong = [...draft].length > MAX_TEXT;
  const gone = window.presence === "gone";
  // A pending window (keyed by the other session id) or a gone partner has nothing to close on the server.
  const close = () => commands.closePrivate(windowKey, windowKey !== other.sessionId && !gone);
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (draft.trim() === "" || tooLong || gone) return;
    if (commands.sendPrivate(other.pseudo, draft)) setDraft("");
  };

  if (window.minimised) {
    return (
      <button type="button" className="bevel private-tab" onClick={() => commands.local({ type: "togglePrivate", conversationId: windowKey })}>
        <span className="sr-only">{STRINGS.restore(other.pseudo)}</span>
        <Pseudo pseudo={other.pseudo} gender={other.away ? undefined : other.gender} away={window.presence !== "here"} />
        {window.unread > 0 && <span className="unread"> {STRINGS.unread(window.unread)}</span>}
      </button>
    );
  }

  return (
    <dialog open aria-label={STRINGS.privateWith(other.pseudo)} className="private-window panel">
      <header className="private-title">
        <PseudoMenu target={{ ...other, away: window.presence !== "here" }} />
        <span className="private-actions">
          {windowKey !== other.sessionId && (
            <button type="button" className="link" aria-label={STRINGS.minimise} onClick={() => commands.local({ type: "togglePrivate", conversationId: windowKey })}>_</button>
          )}
          <button type="button" className="link" aria-label={STRINGS.close} onClick={close}>×</button>
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
        <input id={fieldId} value={draft} maxLength={2000} autoComplete="off" disabled={gone} autoFocus onChange={(e) => setDraft(e.target.value)} />
        <span className={`small${tooLong ? " too-long" : ""}`} aria-live="polite">{[...draft].length}/{MAX_TEXT}</span>
        <button type="submit" className="bevel primary" disabled={tooLong || gone}>{STRINGS.send}</button>
      </form>
    </dialog>
  );
};

/** Every private window, docked bottom right on desktop and as a tab bar on phones (`web-ui/07`). */
export const PrivateWindows = () => {
  const { state } = useChat();
  // One draft per chatter, so it survives the pending → conversation key change.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const entries = Object.entries(state.windows);
  if (entries.length === 0) return null;
  return (
    <aside className="privates" aria-label={STRINGS.privateWindows}>
      {entries.map(([key, window]) => (
        <PrivateWindow
          key={window.other.sessionId}
          windowKey={key}
          window={window}
          draft={drafts[window.other.sessionId] ?? ""}
          setDraft={(text) => setDrafts((current) => ({ ...current, [window.other.sessionId]: text }))}
        />
      ))}
    </aside>
  );
};
