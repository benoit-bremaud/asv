import { useLayoutEffect, useRef, useState, type SubmitEvent, type UIEvent } from "react";
import type { Gender, Member } from "../../shared/protocol";
import { hasForbiddenChar } from "../../domain/text";
import { useChat } from "../chat-context";
import { renderText, SMILEYS } from "../render";
import { MAX_TEXT, reportContext } from "../store";
import { STRINGS } from "../strings";
import { Header } from "./Header";
import { Pseudo } from "./Pseudo";
import { PseudoMenu } from "./PseudoMenu";
import { SearchDialog } from "./SearchPanel";


/** Distance from the bottom, in pixels, still counted as "at the bottom" (rounding, last line half shown). */
const FOLLOW_SLACK_PX = 8;

const MemberLine = ({ member, knownGender }: { member: Member; knownGender?: Gender }) =>
  member.away ? (
    <li><PseudoMenu target={{ ...member, gender: knownGender }} /></li>
  ) : (
    <li>
      <PseudoMenu target={member} /> {member.age}
      {member.city && <span className="small"> {member.city}</span>}
    </li>
  );

/** The room message field, where the focus lands once the last private window closes (`web-ui/07`). */
export const MESSAGE_FIELD_ID = "message";

/** UC3, UC4: room tabs, lines, members and the message field. */
export const RoomScreen = () => {
  const { state, commands } = useChat();
  // One draft per room, so a draft never follows a tab switch into another room.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showMembers, setShowMembers] = useState(false);
  const roomId = state.active ?? "";
  const text = drafts[roomId] ?? "";
  const setText = (value: string) => setDrafts((current) => ({ ...current, [roomId]: value }));
  const room = state.open[roomId];
  // Desktop: the lines scroll in their panel and follow new messages while the reader is at the bottom (`web-ui/04`).
  const lines = useRef<HTMLElement>(null);
  const atBottom = useRef(true);
  const lastLineId = room?.lines.at(-1)?.id;
  useLayoutEffect(() => {
    atBottom.current = true;
  }, [roomId]);
  useLayoutEffect(() => {
    if (lines.current && atBottom.current) lines.current.scrollTop = lines.current.scrollHeight;
  }, [roomId, lastLineId]);
  // A shrinking panel (first docked private window, resize) fires no scroll event: keep the bottom in view.
  const hasRoom = room !== undefined;
  useLayoutEffect(() => {
    const panel = lines.current;
    if (!panel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (atBottom.current) panel.scrollTop = panel.scrollHeight;
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [hasRoom]);
  const followBottom = ({ currentTarget: panel }: UIEvent<HTMLElement>) => {
    atBottom.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < FOLLOW_SLACK_PX;
  };
  const nameOf = (id: string) => state.roomList.find((summary) => summary.id === id)?.name ?? id;
  if (!room) return null;

  // BR-020 counts code points; the text stays in the field until it fits.
  const tooLong = [...text].length > MAX_TEXT;
  // BR-090, checked on the trimmed text as the server does; the text stays in the field.
  const invisible = hasForbiddenChar(text.trim());
  // A11Y-03 (#121): the field names what refuses it.
  const describedBy = [tooLong && `${MESSAGE_FIELD_ID}-count`, invisible && `${MESSAGE_FIELD_ID}-invisible`].filter(Boolean).join(" ") || undefined;
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (text.trim() === "" || tooLong || invisible) return;
    // Offline: nothing left, so the draft stays (`write` shows the notice).
    if (!commands.post(roomId, text)) return;
    setText("");
    // The reader's own message always brings the lines back to the bottom (#85).
    atBottom.current = true;
  };

  return (
    <>
      <Header />
      <nav className="tabs" aria-label="salons">
        <button type="button" className="bevel" onClick={() => commands.local({ type: "showRooms" })}>{STRINGS.backToRooms}</button>
        <button type="button" className="bevel" aria-haspopup="dialog" onClick={(event) => {
          // Safari and Firefox on macOS do not focus a clicked button: focus it, so the dialog gives it back (#130).
          event.currentTarget.focus();
          commands.local({ type: "openSearch" });
        }}>{STRINGS.search}</button>
        {Object.keys(state.open).map((id) => (
          <span key={id} className={`tab${id === roomId ? " tab-active" : ""}`}>
            <button type="button" className="link" aria-current={id === roomId} onClick={() => commands.local({ type: "showRoom", roomId: id })}>
              # {nameOf(id)}
            </button>
            <button type="button" className="link icon-button" aria-label={STRINGS.closeTab(nameOf(id))} onClick={() => commands.leaveRoom(id)}>×</button>
          </span>
        ))}
      </nav>
      {state.searchOpen && <SearchDialog onClose={() => commands.local({ type: "closeSearch" })} />}
      <main className="room">
        <section ref={lines} className="lines panel" onScroll={followBottom}>
          <h2># {nameOf(roomId)}</h2>
          <ol role="log" aria-live="polite">
            {/* BR-042: a line still held from an ignored chatter is hidden. */}
            {room.lines.filter((line) => !state.ignored.includes(line.authorSessionId)).map((line) => (
              <li key={line.id}>
                <Pseudo pseudo={line.pseudo} gender={line.gender} />: {renderText(line.text)}
                {state.canReport && line.authorSessionId !== state.me?.sessionId && (
                  // UC9: a message is reported with the lines up to it (BR-051).
                  <button type="button" className="link icon-button report-line" aria-label={STRINGS.reportMessage(line.pseudo)} onClick={() => commands.local({
                    type: "openReport",
                    draft: { targetKind: "message", targetPseudo: line.pseudo, excerpt: line.text, context: reportContext(room.lines, line.id) },
                  })}>⚑</button>
                )}
              </li>
            ))}
          </ol>
        </section>
        <aside className={`members panel${showMembers ? " members-open" : ""}`}>
          <h2>{STRINGS.members} ({room.members.length})</h2>
          <ul>
            {room.members.map((member) => (
              <MemberLine key={member.sessionId} member={member} knownGender={state.known[member.sessionId]} />
            ))}
          </ul>
        </aside>
        <button type="button" className="bevel members-toggle" aria-expanded={showMembers} onClick={() => setShowMembers(!showMembers)}>
          {STRINGS.members} ({room.members.length})
        </button>
        <form className="composer" onSubmit={submit}>
          <label className="sr-only" htmlFor={MESSAGE_FIELD_ID}>{STRINGS.message}</label>
          <input id={MESSAGE_FIELD_ID} value={text} aria-invalid={describedBy ? true : undefined} aria-describedby={describedBy} maxLength={2000} autoComplete="off" onChange={(e) => setText(e.target.value)} />
          <span id={`${MESSAGE_FIELD_ID}-count`} className={`small${tooLong ? " too-long" : ""}`} aria-live="polite">{[...text].length}/{MAX_TEXT}</span>
          {invisible && <output id={`${MESSAGE_FIELD_ID}-invisible`} className="small too-long">{STRINGS.invisibleChars}</output>}
          <details className="smileys">
            <summary>{STRINGS.smileys}</summary>
            {Object.entries(SMILEYS).map(([code, symbol]) => (
              <button key={code} type="button" className="link icon-button" aria-label={code} onClick={() => setText(`${text}${code}`)}>{symbol}</button>
            ))}
          </details>
          <button type="submit" className="bevel primary" disabled={tooLong || invisible}>{STRINGS.send}</button>
        </form>
      </main>
    </>
  );
};
