import { useState, type FormEvent } from "react";
import { useChat } from "../chat-context";
import { STRINGS } from "../strings";
import { Header } from "./Header";

/** UC2, UC3, UC5: the room list with counts and the create form. */
export const RoomsScreen = () => {
  const { state, commands } = useChat();
  const [name, setName] = useState("");
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
  const create = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "") return;
    commands.createRoom(name);
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
            <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="bevel">{STRINGS.create}</button>
        </form>
      </main>
    </>
  );
};
