import { useState, type SubmitEvent } from "react";
import { useChat } from "../chat-context";
import { STRINGS } from "../strings";
import { PseudoMenu } from "./PseudoMenu";

const MIN_QUERY = 2;

/** UC7: find a chatter by pseudo or city; a click on a result opens its pseudo menu (`web-ui/07`). */
export const SearchPanel = () => {
  const { state, commands } = useChat();
  const [query, setQuery] = useState(state.search.query);
  const [short, setShort] = useState(false);
  const nameOf = (id: string) => state.roomList.find((room) => room.id === id)?.name ?? id;
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const tooShort = [...query.trim()].length < MIN_QUERY;
    setShort(tooShort);
    if (!tooShort) commands.search(query);
  };
  const { search } = state;
  const searched = search.query !== "" && !search.pending;

  return (
    <section className="panel search" aria-labelledby="search-title">
      <h2 id="search-title">{STRINGS.searchTitle}</h2>
      <form onSubmit={submit} role="search">
        <label>
          {STRINGS.searchLabel}
          <input value={query} maxLength={64} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button type="submit" className="bevel">{STRINGS.search}</button>
        {searched && (
          <button type="button" className="link" onClick={() => { setQuery(""); commands.local({ type: "clearSearch" }); }}>{STRINGS.cancel}</button>
        )}
      </form>
      {short && <p className="small" role="alert">{STRINGS.searchShort}</p>}
      {searched && search.results.length === 0 && <p className="small">{STRINGS.noResult}</p>}
      {searched && search.results.length > 0 && (
        <ul className="search-results">
          {search.results.map((hit) => (
            <li key={hit.sessionId}>
              <PseudoMenu target={hit} />
              {!hit.away && <> {hit.age}{hit.city && <span className="small"> {hit.city}</span>}</>}
              {hit.rooms.length > 0 && <span className="small"> — {STRINGS.inRooms(hit.rooms.map(nameOf).join(", "))}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
