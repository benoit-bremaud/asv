import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useChat } from "../chat-context";
import { STRINGS } from "../strings";
import { Header } from "./Header";
import { SearchPanel } from "./SearchPanel";

/** UC2, UC3, UC5: the room list with counts and the create form. */
export const RoomsScreen = () => {
  const { state, commands } = useChat();
  const [name, setName] = useState("");
  // #151: the last name sent with its seq, given back if the server refuses it and the field is still empty.
  const sent = useRef<{ seq: number; name: string } | undefined>(undefined);
  useEffect(() => {
    const last = sent.current;
    if (!last || last.seq !== state.refusedSeq) return;
    sent.current = undefined;
    setName((current) => (current === "" ? last.name : current));
  }, [state.refusedSeq]);
  const official = state.roomList.filter((room) => room.kind !== "user");
  const user = state.roomList.filter((room) => room.kind === "user");
  const open = (roomId: string) =>
    state.open[roomId] ? commands.local({ type: "showRoom", roomId }) : commands.joinRoom(roomId);
  const list = (rooms: typeof official) => (
    <ul className="room-list">
      {rooms.map((room) => (
        <li key={room.id}>
          <button type="button" className="link" onClick={() => open(room.id)}>
            {room.name} ({room.count})
          </button>
        </li>
      ))}
    </ul>
  );
  const create = (event: SubmitEvent) => {
    event.preventDefault();
    if (name.trim() === "") return;
    // Offline: nothing left, so the name stays (`write` shows the notice).
    const seq = commands.createRoom(name);
    if (seq === undefined) return;
    sent.current = { seq, name };
    setName("");
  };

  return (
    <>
      <Header />
      <main className="rooms">
        <section className="panel">
          <h2>{STRINGS.officialRooms}</h2>
          {list(official)}
          <h2>{STRINGS.userRooms}</h2>
          {user.length > 0 ? list(user) : <p className="small">{STRINGS.noUserRoom}</p>}
        </section>
        <form className="panel" onSubmit={create}>
          <h2>{STRINGS.createRoom}</h2>
          <label>
            {STRINGS.roomName}
            <input name="roomName" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="bevel">{STRINGS.create}</button>
        </form>
        <SearchPanel />
      </main>
    </>
  );
};
