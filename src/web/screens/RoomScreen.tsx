import { useState, type SubmitEvent } from "react";
import type { Gender, Member } from "../../shared/protocol";
import { useChat } from "../chat-context";
import { renderText, SMILEYS } from "../render";
import { STRINGS } from "../strings";
import { Header } from "./Header";
import { Pseudo } from "./Pseudo";

const MAX_TEXT = 500;

const MemberLine = ({ member, knownGender }: { member: Member; knownGender?: Gender }) =>
  member.away ? (
    <li><Pseudo pseudo={member.pseudo} gender={knownGender} away /></li>
  ) : (
    <li>
      <Pseudo pseudo={member.pseudo} gender={member.gender} /> {member.age}
      {member.city && <span className="small"> {member.city}</span>}
    </li>
  );

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
  const nameOf = (id: string) => state.roomList.find((summary) => summary.id === id)?.name ?? id;
  if (!room) return null;

  // BR-020 counts code points; the text stays in the field until it fits.
  const tooLong = [...text].length > MAX_TEXT;
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (text.trim() === "" || tooLong) return;
    commands.post(roomId, text);
    setText("");
  };

  return (
    <>
      <Header />
      <nav className="tabs" aria-label="salons">
        <button type="button" className="bevel" onClick={() => commands.local({ type: "showRooms" })}>{STRINGS.backToRooms}</button>
        {Object.keys(state.open).map((id) => (
          <span key={id} className={`tab${id === roomId ? " tab-active" : ""}`}>
            <button type="button" className="link" aria-current={id === roomId} onClick={() => commands.local({ type: "showRoom", roomId: id })}>
              # {nameOf(id)}
            </button>
            <button type="button" className="link" aria-label={STRINGS.closeTab(nameOf(id))} onClick={() => commands.leaveRoom(id)}>×</button>
          </span>
        ))}
      </nav>
      <main className="room">
        <section className="lines panel">
          <h2># {nameOf(roomId)}</h2>
          <ol role="log" aria-live="polite">
            {room.lines.map((line) => (
              <li key={line.id}>
                <Pseudo pseudo={line.pseudo} gender={line.gender} />: {renderText(line.text)}
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
          <label className="sr-only" htmlFor="message">{STRINGS.message}</label>
          <input id="message" value={text} maxLength={2000} autoComplete="off" onChange={(e) => setText(e.target.value)} />
          <span className={`small${tooLong ? " too-long" : ""}`} aria-live="polite">{[...text].length}/{MAX_TEXT}</span>
          <details className="smileys">
            <summary>{STRINGS.smileys}</summary>
            {Object.entries(SMILEYS).map(([code, symbol]) => (
              <button key={code} type="button" className="link" aria-label={code} onClick={() => setText(`${text}${code}`)}>{symbol}</button>
            ))}
          </details>
          <button type="submit" className="bevel primary" disabled={tooLong}>{STRINGS.send}</button>
        </form>
      </main>
    </>
  );
};
